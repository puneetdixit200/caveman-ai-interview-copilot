#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434/api/chat";
export const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";
const DEFAULT_PROMPT = "Reply exactly OK.";
const DEFAULT_TIMEOUT_MS = 30_000;

export function ollamaTagsEndpoint(endpoint = DEFAULT_OLLAMA_ENDPOINT) {
  return endpoint.replace(/\/api\/chat\/?$/, "/api/tags");
}

export function assertOllamaModelInstalled({ configuredModel, installedModels }) {
  if (installedModels.includes(configuredModel)) {
    return configuredModel;
  }

  const installed = installedModels.length > 0 ? installedModels.join(", ") : "none";
  throw new Error(
    `Ollama model ${configuredModel} is not installed. Installed models: ${installed}. Run: ollama pull ${configuredModel}`
  );
}

export async function listInstalledOllamaModels({
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const response = await fetchWithTimeout(fetchImpl, ollamaTagsEndpoint(endpoint), { method: "GET" }, timeoutMs);
  if (!response.ok) {
    throw new Error(`Ollama tags endpoint failed with ${response.status}`);
  }

  const payload = await response.json();
  const models = Array.isArray(payload?.models) ? payload.models : [];
  return models
    .map((model) => model?.name ?? model?.model ?? model?.id)
    .filter((model) => typeof model === "string" && model.trim().length > 0)
    .map((model) => model.trim());
}

export async function requestOllamaChatSmoke({
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  model = DEFAULT_OLLAMA_MODEL,
  prompt = DEFAULT_PROMPT,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const response = await fetchWithTimeout(
    fetchImpl,
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false
      })
    },
    timeoutMs
  );
  const payload = await safeJson(response);
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? ` ${payload.error}` : "";
    throw new Error(`Ollama chat smoke failed for ${model}: ${response.status}${detail}`);
  }

  const content = typeof payload?.message?.content === "string" ? payload.message.content.trim() : "";
  if (!content) {
    throw new Error(`Ollama chat smoke failed for ${model}: empty response`);
  }

  return {
    model: typeof payload?.model === "string" ? payload.model : model,
    content,
    durationMs:
      typeof payload?.total_duration === "number" ? Math.round(payload.total_duration / 1_000_000) : undefined
  };
}

export async function ollamaChatSmoke(options = {}) {
  return requestOllamaChatSmoke(options);
}

export async function runOllamaSmoke({
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  model = DEFAULT_OLLAMA_MODEL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const installedModels = await listInstalledOllamaModels({ endpoint, fetchImpl, timeoutMs });
  const configuredModel = assertOllamaModelInstalled({ configuredModel: model, installedModels });
  const chat = await requestOllamaChatSmoke({ endpoint, model: configuredModel, fetchImpl, timeoutMs });

  return {
    status: "ready",
    endpoint,
    model: configuredModel,
    installedModels,
    firstText: chat.content,
    durationMs: chat.durationMs
  };
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    switch (arg) {
      case "--endpoint":
        options.endpoint = next();
        break;
      case "--model":
        options.model = next();
        break;
      case "--timeout-ms":
        options.timeoutMs = Number(next());
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/ollama-smoke.mjs [--endpoint URL] [--model NAME] [--timeout-ms MS]

Verifies the configured Ollama model is installed and can answer a local chat request.`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }

  try {
    const result = await runOllamaSmoke(options);
    console.log("READY");
    console.log(`- Ollama endpoint: ${result.endpoint}`);
    console.log(`- Ollama model: ${result.model}`);
    console.log(`- Installed models: ${result.installedModels.join(", ")}`);
    console.log(`- First response: ${result.firstText}`);
    if (typeof result.durationMs === "number") {
      console.log(`- Provider latency: ${result.durationMs}ms`);
    }
  } catch (error) {
    console.log("BLOCKED");
    console.log(`- ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
