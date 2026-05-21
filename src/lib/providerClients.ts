import type { ChatStreamParams, HealthCheckResult, ModelInfo } from "../types/ai";
import type { ModelProviderConfig } from "../types/settings";
import type { AIProvider } from "./providerRouter";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const OPENROUTER_REFERER = "https://github.com/puneetdixit200/caveman-ai-interview-copilot";
const OPENROUTER_TITLE = "Caveman AI Interview Copilot";

export interface ProviderClientOptions {
  localOnlyMode?: boolean;
  blockCloudWhenLocalOnly?: boolean;
}

export function createConfiguredProvider(
  config: ModelProviderConfig,
  fetchImpl: FetchLike = fetch,
  options: ProviderClientOptions = {}
): AIProvider {
  return {
    id: config.id,
    label: config.label,
    kind: config.kind,
    healthCheck: () => healthCheck(config, fetchImpl, options),
    listModels: () => listModels(config, fetchImpl, options),
    chatStream: (params) => chatStream(config, params, fetchImpl, options)
  };
}

async function healthCheck(
  config: ModelProviderConfig,
  fetchImpl: FetchLike,
  options: ProviderClientOptions
): Promise<HealthCheckResult> {
  if (!config.enabled) {
    return { ok: false, latencyMs: 0, error: `${config.label} is disabled` };
  }

  const secretError = validateSecret(config);
  if (secretError) {
    return { ok: false, latencyMs: 0, error: secretError };
  }

  const networkError = validateNetworkAccess(config, options);
  if (networkError) {
    return { ok: false, latencyMs: 0, error: networkError };
  }

  if (config.kind === "cloud") {
    return { ok: true, latencyMs: 0 };
  }

  const startedAt = performance.now();
  try {
    const response = await fetchImpl(healthEndpoint(config), {
      method: "GET",
      headers: requestHeaders(config)
    });
    return {
      ok: response.ok,
      latencyMs: Math.round(performance.now() - startedAt),
      error: response.ok ? undefined : `${config.label} health check returned ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function listModels(
  config: ModelProviderConfig,
  fetchImpl: FetchLike,
  options: ProviderClientOptions
): Promise<ModelInfo[]> {
  const secretError = validateSecret(config);
  if (secretError) {
    throw new Error(secretError);
  }

  const networkError = validateNetworkAccess(config, options);
  if (networkError) {
    throw new Error(networkError);
  }

  if (config.id === "anthropic") {
    return [{ id: config.model, name: config.model, contextLength: 0 }];
  }

  const response = await fetchImpl(modelListEndpoint(config), {
    method: "GET",
    headers: requestHeaders(config)
  });
  if (!response.ok) {
    throw new Error(`${config.label} model list returned ${response.status}`);
  }

  return parseModelList(config, await response.json());
}

async function* chatStream(
  config: ModelProviderConfig,
  params: ChatStreamParams,
  fetchImpl: FetchLike,
  options: ProviderClientOptions
): AsyncGenerator<string> {
  const secretError = validateSecret(config);
  if (secretError) {
    throw new Error(secretError);
  }

  const networkError = validateNetworkAccess(config, options);
  if (networkError) {
    throw new Error(networkError);
  }

  const response = await fetchImpl(requestEndpoint(config, params), {
    method: "POST",
    headers: requestHeaders(config),
    body: JSON.stringify(requestBody(config, params)),
    signal: params.signal
  });

  if (!response.ok) {
    throw new Error(`${config.label} request failed with ${response.status}`);
  }

  if (!response.body) {
    throw new Error(`${config.label} returned an empty stream`);
  }

  if (config.id === "ollama") {
    yield* parseOllamaStream(response.body);
    return;
  }

  if (config.id === "anthropic") {
    yield* parseAnthropicStream(response.body);
    return;
  }

  if (config.id === "google") {
    yield* parseGeminiStream(response.body);
    return;
  }

  yield* parseSseStream(response.body);
}

function requestHeaders(config: ModelProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers ?? {})
  };

  if (config.apiKey?.trim()) {
    if (config.id === "anthropic") {
      headers["x-api-key"] = config.apiKey.trim();
      headers["anthropic-version"] = "2023-06-01";
    } else if (config.id !== "google") {
      headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }
  }

  if (config.id === "openrouter") {
    headers["HTTP-Referer"] = OPENROUTER_REFERER;
    headers["X-Title"] = OPENROUTER_TITLE;
  }

  return headers;
}

function requestEndpoint(config: ModelProviderConfig, params: ChatStreamParams): string {
  if (config.id !== "google") {
    return config.endpoint;
  }

  const model = params.model ?? config.model;
  const endpoint = config.endpoint.replace(/models\/[^/:]+:streamGenerateContent/, `models/${encodeURIComponent(model)}:streamGenerateContent`);
  const url = new URL(endpoint);
  url.searchParams.set("alt", "sse");
  url.searchParams.set("key", config.apiKey?.trim() ?? "");
  return url.toString();
}

function requestBody(config: ModelProviderConfig, params: ChatStreamParams): Record<string, unknown> {
  if (config.id === "ollama") {
    return {
      model: params.model ?? config.model,
      messages: params.messages,
      stream: true,
      options: {
        temperature: params.temperature,
        num_predict: params.maxTokens
      }
    };
  }

  if (config.id === "google") {
    const systemMessages = params.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content.trim())
      .filter(Boolean);
    return {
      ...(systemMessages.length > 0
        ? {
            systemInstruction: {
              parts: [{ text: systemMessages.join("\n\n") }]
            }
          }
        : {}),
      contents: params.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }]
        })),
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens
      }
    };
  }

  if (config.id === "anthropic") {
    const systemMessages = params.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content.trim())
      .filter(Boolean);
    return {
      model: params.model ?? config.model,
      max_tokens: params.maxTokens ?? 1024,
      stream: true,
      ...(systemMessages.length > 0 ? { system: systemMessages.join("\n\n") } : {}),
      messages: params.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content
        }))
    };
  }

  return {
    model: params.model ?? config.model,
    messages: params.messages,
    stream: true,
    temperature: params.temperature,
    max_tokens: params.maxTokens
  };
}

function validateSecret(config: ModelProviderConfig): string | undefined {
  if (config.kind === "cloud" && !config.apiKey?.trim()) {
    return `${config.label} API key is required`;
  }

  return undefined;
}

function validateNetworkAccess(config: ModelProviderConfig, options: ProviderClientOptions): string | undefined {
  if (config.kind === "cloud" && options.localOnlyMode && (options.blockCloudWhenLocalOnly ?? true)) {
    return `${config.label} is blocked by local-only mode`;
  }

  return undefined;
}

function healthEndpoint(config: ModelProviderConfig): string {
  if (config.id === "ollama") {
    return config.endpoint.replace(/\/api\/chat\/?$/, "/api/tags");
  }

  if (config.endpoint.includes("/v1/chat/completions")) {
    return config.endpoint.replace(/\/v1\/chat\/completions\/?$/, "/v1/models");
  }

  if (config.id === "anthropic") {
    return config.endpoint;
  }

  return config.endpoint;
}

function modelListEndpoint(config: ModelProviderConfig): string {
  if (config.id === "ollama") {
    return config.endpoint.replace(/\/api\/chat\/?$/, "/api/tags");
  }

  if (config.id === "google") {
    const url = new URL(config.endpoint);
    url.pathname = url.pathname.replace(/\/models\/[^/]+:streamGenerateContent$/, "/models");
    url.search = "";
    url.searchParams.set("key", config.apiKey?.trim() ?? "");
    return url.toString();
  }

  if (config.endpoint.includes("/v1/chat/completions")) {
    return config.endpoint.replace(/\/v1\/chat\/completions\/?$/, "/v1/models");
  }

  if (config.endpoint.includes("/api/v1/chat/completions")) {
    return config.endpoint.replace(/\/api\/v1\/chat\/completions\/?$/, "/api/v1/models");
  }

  return config.endpoint;
}

function parseModelList(config: ModelProviderConfig, payload: unknown): ModelInfo[] {
  const record = isRecord(payload) ? payload : {};
  const rawModels = Array.isArray(record.models)
    ? record.models
    : Array.isArray(record.data)
      ? record.data
      : [];

  return rawModels.flatMap((entry): ModelInfo[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const rawId = readString(entry.id) ?? readString(entry.name) ?? readString(entry.model);
    if (!rawId) {
      return [];
    }

    const id = config.id === "google" ? rawId.replace(/^models\//, "") : rawId;
    const name =
      readString(entry.displayName) ??
      readString(entry.name)?.replace(/^models\//, "") ??
      id;
    const contextLength = readNumber(entry.context_length) ?? readNumber(entry.contextLength) ?? readNumber(entry.inputTokenLimit) ?? 0;

    return [
      {
        id,
        name,
        contextLength,
        pricing: readPricing(entry.pricing)
      }
    ];
  });
}

function readPricing(value: unknown): ModelInfo["pricing"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const inputPerToken = readNumber(value.prompt) ?? readNumber(value.input);
  const outputPerToken = readNumber(value.completion) ?? readNumber(value.output);
  if (inputPerToken === undefined || outputPerToken === undefined) {
    return undefined;
  }

  return {
    inputPer1k: inputPerToken * 1000,
    outputPer1k: outputPerToken * 1000
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function* parseOllamaStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let buffer = "";

  for await (const chunk of decodeBody(body)) {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const content = parseOllamaLine(line);
      if (content) {
        yield content;
      }
    }
  }

  const finalContent = parseOllamaLine(buffer);
  if (finalContent) {
    yield finalContent;
  }
}

function parseOllamaLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  const parsed = JSON.parse(trimmed) as { message?: { content?: string }; response?: string };
  return parsed.message?.content ?? parsed.response ?? "";
}

async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let buffer = "";

  for await (const chunk of decodeBody(body)) {
    buffer += chunk;
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const content = parseSseEvent(event);
      if (content) {
        yield content;
      }
    }
  }

  const finalContent = parseSseEvent(buffer);
  if (finalContent) {
    yield finalContent;
  }
}

function parseSseEvent(event: string): string {
  const lines = event
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"));

  let content = "";
  for (const line of lines) {
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string }; text?: string }> };
    content += parsed.choices?.map((choice) => choice.delta?.content ?? choice.text ?? "").join("") ?? "";
  }

  return content;
}

async function* parseAnthropicStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let buffer = "";

  for await (const chunk of decodeBody(body)) {
    buffer += chunk;
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const content = parseAnthropicEvent(event);
      if (content) {
        yield content;
      }
    }
  }

  const finalContent = parseAnthropicEvent(buffer);
  if (finalContent) {
    yield finalContent;
  }
}

function parseAnthropicEvent(event: string): string {
  const lines = event
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"));

  let content = "";
  for (const line of lines) {
    const payload = line.slice("data:".length).trim();
    if (!payload) {
      continue;
    }

    const parsed = JSON.parse(payload) as { delta?: { text?: string } };
    content += parsed.delta?.text ?? "";
  }

  return content;
}

async function* parseGeminiStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let buffer = "";

  for await (const chunk of decodeBody(body)) {
    buffer += chunk;
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const content = parseGeminiEvent(event);
      if (content) {
        yield content;
      }
    }
  }

  const finalContent = parseGeminiEvent(buffer);
  if (finalContent) {
    yield finalContent;
  }
}

function parseGeminiEvent(event: string): string {
  const lines = event
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"));

  let content = "";
  for (const line of lines) {
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    const parsed = JSON.parse(payload) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    content +=
      parsed.candidates
        ?.flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("") ?? "";
  }

  return content;
}

async function* decodeBody(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    yield decoder.decode(value, { stream: true });
  }

  const tail = decoder.decode();
  if (tail) {
    yield tail;
  }
}
