import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOllamaModelInstalled,
  ollamaChatSmoke,
  ollamaTagsEndpoint,
  requestOllamaChatSmoke,
  runOllamaSmoke
} from "./ollama-smoke.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("resolves the Ollama tags endpoint from the chat endpoint", () => {
  assert.equal(
    ollamaTagsEndpoint("http://localhost:11434/api/chat"),
    "http://localhost:11434/api/tags"
  );
});

test("fails with an install command when the configured Ollama model is missing", () => {
  assert.throws(
    () =>
      assertOllamaModelInstalled({
        configuredModel: "llama3.1:8b",
        installedModels: ["qwen2.5:0.5b"]
      }),
    /Run: ollama pull llama3.1:8b/
  );
});

test("accepts a configured Ollama model from the installed tags list", () => {
  assert.equal(
    assertOllamaModelInstalled({
      configuredModel: "llama3.1:8b",
      installedModels: ["qwen2.5:0.5b", "llama3.1:8b"]
    }),
    "llama3.1:8b"
  );
});

test("posts a non-streaming chat smoke request to Ollama", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    return jsonResponse({
      model: "llama3.1:8b",
      message: { role: "assistant", content: "OK" },
      total_duration: 1200000000
    });
  };

  const result = await requestOllamaChatSmoke({
    endpoint: "http://localhost:11434/api/chat",
    model: "llama3.1:8b",
    fetchImpl
  });

  assert.equal(result.model, "llama3.1:8b");
  assert.equal(result.content, "OK");
  assert.equal(calls[0][0], "http://localhost:11434/api/chat");
  assert.equal(JSON.parse(calls[0][1].body).stream, false);
});

test("runs the full Ollama smoke through tags and chat", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/api/tags")) {
      return jsonResponse({ models: [{ name: "llama3.1:8b" }] });
    }
    return jsonResponse({ message: { content: "OK" }, total_duration: 900000000 });
  };

  const result = await runOllamaSmoke({
    endpoint: "http://localhost:11434/api/chat",
    model: "llama3.1:8b",
    fetchImpl
  });

  assert.equal(result.status, "ready");
  assert.equal(result.model, "llama3.1:8b");
  assert.equal(result.firstText, "OK");
});

test("surfaces chat failures with model-specific detail", async () => {
  await assert.rejects(
    () =>
      ollamaChatSmoke({
        endpoint: "http://localhost:11434/api/chat",
        model: "missing-model",
        fetchImpl: async () => jsonResponse({ error: "model not found" }, 404)
      }),
    /Ollama chat smoke failed for missing-model: 404 model not found/
  );
});
