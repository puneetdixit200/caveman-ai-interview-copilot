#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export const DEFAULT_OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";
const DEFAULT_PROMPT = "Reply exactly OK.";
const DEFAULT_TIMEOUT_MS = 30_000;
const OPENROUTER_REFERER = "https://github.com/puneetdixit200/caveman-ai-interview-copilot";
const OPENROUTER_TITLE = "Caveman AI Interview Copilot";

export function openRouterModelsEndpoint(endpoint = DEFAULT_OPENROUTER_ENDPOINT) {
  return endpoint.replace(/\/chat\/completions\/?$/, "/models");
}

export function assertOpenRouterApiKey(apiKey) {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    throw new Error("OPENROUTER_API_KEY is required to live-test the optional OpenRouter route.");
  }
  return trimmed;
}

export function assertOpenRouterModelAvailable({ configuredModel, availableModels }) {
  if (availableModels.includes(configuredModel)) {
    return configuredModel;
  }

  const available = availableModels.length > 0 ? availableModels.slice(0, 12).join(", ") : "none";
  throw new Error(
    `OpenRouter model ${configuredModel} is not available. Available models: ${available}. Choose an available OpenRouter model in Settings.`
  );
}

export async function listOpenRouterModels({
  endpoint = DEFAULT_OPENROUTER_ENDPOINT,
  apiKey = process.env.OPENROUTER_API_KEY,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const key = assertOpenRouterApiKey(apiKey);
  const response = await fetchWithTimeout(
    fetchImpl,
    openRouterModelsEndpoint(endpoint),
    {
      method: "GET",
      headers: openRouterHeaders(key)
    },
    timeoutMs
  );
  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(`OpenRouter model list failed with ${response.status}${formatErrorDetail(payload)}`);
  }

  const models = Array.isArray(payload?.data) ? payload.data : [];
  return models
    .map((model) => model?.id)
    .filter((model) => typeof model === "string" && model.trim().length > 0)
    .map((model) => model.trim());
}

export async function requestOpenRouterChatSmoke({
  endpoint = DEFAULT_OPENROUTER_ENDPOINT,
  apiKey = process.env.OPENROUTER_API_KEY,
  model = DEFAULT_OPENROUTER_MODEL,
  prompt = DEFAULT_PROMPT,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const key = assertOpenRouterApiKey(apiKey);
  const response = await fetchWithTimeout(
    fetchImpl,
    endpoint,
    {
      method: "POST",
      headers: openRouterHeaders(key),
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
    throw new Error(`OpenRouter chat smoke failed for ${model}: ${response.status}${formatErrorDetail(payload)}`);
  }

  const content = payload?.choices?.[0]?.message?.content?.trim?.() ?? payload?.choices?.[0]?.text?.trim?.() ?? "";
  if (!content) {
    throw new Error(`OpenRouter chat smoke failed for ${model}: empty response`);
  }

  return {
    model,
    content
  };
}

export async function runOpenRouterSmoke({
  endpoint = DEFAULT_OPENROUTER_ENDPOINT,
  apiKey = process.env.OPENROUTER_API_KEY,
  model = DEFAULT_OPENROUTER_MODEL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const availableModels = await listOpenRouterModels({ endpoint, apiKey, fetchImpl, timeoutMs });
  const configuredModel = assertOpenRouterModelAvailable({ configuredModel: model, availableModels });
  const chat = await requestOpenRouterChatSmoke({ endpoint, apiKey, model: configuredModel, fetchImpl, timeoutMs });

  return {
    status: "ready",
    endpoint,
    model: configuredModel,
    availableModels,
    firstText: chat.content
  };
}

function openRouterHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": OPENROUTER_REFERER,
    "X-Title": OPENROUTER_TITLE
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

function formatErrorDetail(payload) {
  const message =
    typeof payload?.error?.message === "string"
      ? payload.error.message
      : typeof payload?.error === "string"
        ? payload.error
        : undefined;
  return message ? ` ${message}` : "";
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
      case "--api-key":
        options.apiKey = next();
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
  console.log(`Usage: node scripts/openrouter-smoke.mjs [--endpoint URL] [--model NAME] [--api-key KEY] [--timeout-ms MS]

Verifies the optional OpenRouter route with OPENROUTER_API_KEY or --api-key.`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }

  try {
    const result = await runOpenRouterSmoke(options);
    console.log("READY");
    console.log(`- OpenRouter endpoint: ${result.endpoint}`);
    console.log(`- OpenRouter model: ${result.model}`);
    console.log(`- Available models seen: ${result.availableModels.length}`);
    console.log(`- First response: ${result.firstText}`);
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
