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

  it("requires API keys for every direct cloud provider before making requests", async () => {
    const fetchImpl = vi.fn();

    for (const directProvider of [
      { id: "google", label: "Google Gemini" },
      { id: "mistral", label: "Mistral" },
      { id: "together", label: "Together AI" },
      { id: "fireworks", label: "Fireworks AI" }
    ] as const) {
      const configured = createConfiguredProvider(
        provider({
          id: directProvider.id,
          label: directProvider.label,
          kind: "cloud",
          endpoint: "https://example.com/v1/chat/completions",
          model: "provider-model",
          apiKeyStored: false,
          apiKey: ""
        }),
        fetchImpl
      );

      await expect(configured.healthCheck()).resolves.toMatchObject({
        ok: false,
        error: `${directProvider.label} API key is required`
      });
    }

    expect(fetchImpl).not.toHaveBeenCalled();
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

  it("streams Google Gemini SSE text with Gemini request format and API-key query auth", async () => {
    const fetchImpl = vi.fn(async () =>
      streamingResponse(
        [
          'data: {"candidates":[{"content":{"parts":[{"text":"Use "}]}}]}',
          'data: {"candidates":[{"content":{"parts":[{"text":"queues"}]}}]}'
        ].join("\n\n")
      )
    );
    const configured = createConfiguredProvider(
      provider({
        id: "google",
        label: "Google Gemini",
        kind: "cloud",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent",
        model: "gemini-2.5-flash",
        apiKeyStored: true,
        apiKey: "gemini-key"
      }),
      fetchImpl
    );

    const chunks: string[] = [];
    for await (const chunk of configured.chatStream({
      messages: [
        { role: "system", content: "Use concise interview answers." },
        { role: "user", content: "How do I design async jobs?" },
        { role: "assistant", content: "Start with requirements." },
        { role: "user", content: "What should I say next?" }
      ],
      temperature: 0.2,
      maxTokens: 512
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Use ", "queues"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=gemini-key",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "Use concise interview answers." }]
          },
          contents: [
            { role: "user", parts: [{ text: "How do I design async jobs?" }] },
            { role: "model", parts: [{ text: "Start with requirements." }] },
            { role: "user", parts: [{ text: "What should I say next?" }] }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 512
          }
        })
      })
    );
  });

  it("uses OpenAI-compatible streaming for Mistral, Together, and Fireworks direct providers", async () => {
    for (const directProvider of [
      ["mistral", "Mistral", "https://api.mistral.ai/v1/chat/completions"],
      ["together", "Together AI", "https://api.together.ai/v1/chat/completions"],
      ["fireworks", "Fireworks AI", "https://api.fireworks.ai/inference/v1/chat/completions"]
    ] as const) {
      const fetchImpl = vi.fn(async () => streamingResponse('data: {"choices":[{"delta":{"content":"ok"}}]}'));
      const configured = createConfiguredProvider(
        provider({
          id: directProvider[0],
          label: directProvider[1],
          kind: "cloud",
          endpoint: directProvider[2],
          model: "provider-model",
          apiKeyStored: true,
          apiKey: "provider-key"
        }),
        fetchImpl
      );

      const chunks: string[] = [];
      for await (const chunk of configured.chatStream({
        messages: [{ role: "user", content: "Answer" }],
        maxTokens: 256
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["ok"]);
      expect(fetchImpl).toHaveBeenCalledWith(
        directProvider[2],
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer provider-key" }),
          body: JSON.stringify({
            model: "provider-model",
            messages: [{ role: "user", content: "Answer" }],
            stream: true,
            temperature: undefined,
            max_tokens: 256
          })
        })
      );
    }
  });
});
