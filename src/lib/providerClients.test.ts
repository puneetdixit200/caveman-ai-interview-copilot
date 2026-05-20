import { describe, expect, it, vi } from "vitest";
import { createConfiguredProvider } from "./providerClients";
import type { ModelProviderConfig } from "../types/settings";

function streamingResponse(body: string, status = 200): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      }
    }),
    { status }
  );
}

function provider(overrides: Partial<ModelProviderConfig>): ModelProviderConfig {
  return {
    id: "ollama",
    label: "Ollama",
    kind: "local",
    endpoint: "http://localhost:11434/api/chat",
    model: "llama3.1:8b",
    enabled: true,
    apiKeyStored: false,
    ...overrides
  };
}

describe("createConfiguredProvider", () => {
  it("streams Ollama NDJSON message content", async () => {
    const fetchImpl = vi.fn(async () =>
      streamingResponse(
        [
          JSON.stringify({ message: { content: "Hash" } }),
          JSON.stringify({ message: { content: "Map" } }),
          JSON.stringify({ done: true })
        ].join("\n")
      )
    );
    const configured = createConfiguredProvider(provider({ id: "ollama" }), fetchImpl);

    const chunks: string[] = [];
    for await (const chunk of configured.chatStream({
      messages: [{ role: "user", content: "Explain HashMap" }]
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hash", "Map"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" })
      })
    );
  });

  it("streams OpenAI-compatible SSE delta content", async () => {
    const fetchImpl = vi.fn(async () =>
      streamingResponse(
        [
          'data: {"choices":[{"delta":{"content":"Use "}}]}',
          'data: {"choices":[{"delta":{"content":"indexes"}}]}',
          "data: [DONE]"
        ].join("\n\n")
      )
    );
    const configured = createConfiguredProvider(
      provider({
        id: "lmstudio",
        label: "LM Studio",
        endpoint: "http://localhost:1234/v1/chat/completions",
        model: "local-model"
      }),
      fetchImpl
    );

    const chunks: string[] = [];
    for await (const chunk of configured.chatStream({
      messages: [{ role: "user", content: "How do databases speed up reads?" }]
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Use ", "indexes"]);
  });

  it("does not call OpenRouter when the API key is missing", async () => {
    const fetchImpl = vi.fn();
    const configured = createConfiguredProvider(
      provider({
        id: "openrouter",
        label: "OpenRouter",
        kind: "cloud",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: "openai/gpt-4o-mini",
        apiKeyStored: false,
        apiKey: ""
      }),
      fetchImpl
    );

    await expect(configured.healthCheck()).resolves.toMatchObject({
      ok: false,
      error: "OpenRouter API key is required"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends OpenRouter bearer auth and metadata headers when configured", async () => {
    const fetchImpl = vi.fn(async () => streamingResponse("data: [DONE]"));
    const configured = createConfiguredProvider(
      provider({
        id: "openrouter",
        label: "OpenRouter",
        kind: "cloud",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: "openai/gpt-4o-mini",
        apiKeyStored: true,
        apiKey: "sk-test"
      }),
      fetchImpl
    );

    for await (const _chunk of configured.chatStream({
      messages: [{ role: "user", content: "Give me a system design outline" }]
    })) {
      // The empty stream is enough to inspect the request.
    }

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          "HTTP-Referer": "https://github.com/puneetdixit200/caveman-ai-interview-copilot",
          "X-Title": "Caveman AI Interview Copilot"
        })
      })
    );
  });

  it("uses Anthropic message format, headers, and streaming parser", async () => {
    const fetchImpl = vi.fn(async () =>
      streamingResponse(
        [
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Start "}}',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"with tradeoffs"}}',
          'event: message_stop\ndata: {"type":"message_stop"}'
        ].join("\n\n")
      )
    );
    const configured = createConfiguredProvider(
      provider({
        id: "anthropic",
        label: "Anthropic",
        kind: "cloud",
        endpoint: "https://api.anthropic.com/v1/messages",
        model: "claude-3-5-sonnet-latest",
        apiKeyStored: true,
        apiKey: "sk-ant-test"
      }),
      fetchImpl
    );

    const chunks: string[] = [];
    for await (const chunk of configured.chatStream({
      messages: [
        { role: "system", content: "You are concise." },
        { role: "user", content: "How should I answer?" }
      ],
      maxTokens: 512
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Start ", "with tradeoffs"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "sk-ant-test",
          "anthropic-version": "2023-06-01"
        }),
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 512,
          stream: true,
          system: "You are concise.",
          messages: [{ role: "user", content: "How should I answer?" }]
        })
      })
    );
  });
});
