import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOpenRouterModelAvailable,
  listOpenRouterModels,
  openRouterModelsEndpoint,
  requestOpenRouterChatSmoke,
  runOpenRouterSmoke
} from "./openrouter-smoke.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("resolves the OpenRouter models endpoint from the chat endpoint", () => {
  assert.equal(
    openRouterModelsEndpoint("https://openrouter.ai/api/v1/chat/completions"),
    "https://openrouter.ai/api/v1/models"
  );
});

test("fails before network calls when the OpenRouter API key is missing", async () => {
  const calls = [];

  await assert.rejects(
    () =>
      requestOpenRouterChatSmoke({
        apiKey: "",
        fetchImpl: async (url, init) => {
          calls.push([url, init]);
          return jsonResponse({});
        }
      }),
    /OPENROUTER_API_KEY is required/
  );
  assert.deepEqual(calls, []);
});

test("lists OpenRouter model ids from the models endpoint", async () => {
  const calls = [];
  const models = await listOpenRouterModels({
    apiKey: "sk-or-test",
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      return jsonResponse({
        data: [
          { id: "openai/gpt-4o-mini", name: "GPT-4o mini" },
          { id: "anthropic/claude-3.5-sonnet", name: "Claude" }
        ]
      });
    }
  });

  assert.deepEqual(models, ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"]);
  assert.equal(calls[0][0], "https://openrouter.ai/api/v1/models");
  assert.equal(calls[0][1].headers.Authorization, "Bearer sk-or-test");
});

test("fails with a model-specific action when the configured OpenRouter model is unavailable", () => {
  assert.throws(
    () =>
      assertOpenRouterModelAvailable({
        configuredModel: "openai/gpt-4o-mini",
        availableModels: ["anthropic/claude-3.5-sonnet"]
      }),
    /Choose an available OpenRouter model/
  );
});

test("posts a non-streaming OpenRouter chat smoke request with required metadata headers", async () => {
  const calls = [];
  const result = await requestOpenRouterChatSmoke({
    apiKey: "sk-or-test",
    model: "openai/gpt-4o-mini",
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      return jsonResponse({
        choices: [{ message: { content: "OK" } }]
      });
    }
  });

  assert.equal(result.model, "openai/gpt-4o-mini");
  assert.equal(result.content, "OK");
  assert.equal(calls[0][0], "https://openrouter.ai/api/v1/chat/completions");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "Reply exactly OK." }],
    stream: false
  });
  assert.equal(calls[0][1].headers.Authorization, "Bearer sk-or-test");
  assert.equal(calls[0][1].headers["HTTP-Referer"], "https://github.com/puneetdixit200/caveman-ai-interview-copilot");
  assert.equal(calls[0][1].headers["X-Title"], "Caveman AI Interview Copilot");
});

test("runs the full OpenRouter smoke through models and chat", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/models")) {
      return jsonResponse({ data: [{ id: "openai/gpt-4o-mini" }] });
    }
    return jsonResponse({ choices: [{ message: { content: "OK" } }] });
  };

  const result = await runOpenRouterSmoke({
    apiKey: "sk-or-test",
    model: "openai/gpt-4o-mini",
    fetchImpl
  });

  assert.equal(result.status, "ready");
  assert.equal(result.model, "openai/gpt-4o-mini");
  assert.equal(result.firstText, "OK");
});

test("surfaces OpenRouter API failures with response detail", async () => {
  await assert.rejects(
    () =>
      requestOpenRouterChatSmoke({
        apiKey: "sk-or-test",
        model: "missing-model",
        fetchImpl: async () => jsonResponse({ error: { message: "No endpoints found" } }, 404)
      }),
    /OpenRouter chat smoke failed for missing-model: 404 No endpoints found/
  );
});
