import { describe, expect, it } from "vitest";
import { ProviderRouter, type AIProvider } from "./providerRouter";

describe("ProviderRouter", () => {
  it("streams from the first healthy provider", async () => {
    const provider: AIProvider = {
      id: "ollama",
      label: "Ollama",
      kind: "local",
      async healthCheck() {
        return { ok: true, latencyMs: 12 };
      },
      async *chatStream() {
        yield "Hash";
        yield "Map";
      }
    };

    const router = new ProviderRouter([provider]);
    const chunks: string[] = [];

    for await (const chunk of router.chatStream({ messages: [{ role: "user", content: "Explain HashMap" }] })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hash", "Map"]);
  });

  it("falls back to the next provider when the primary stream fails", async () => {
    const primary: AIProvider = {
      id: "primary",
      label: "Primary",
      kind: "cloud",
      async healthCheck() {
        return { ok: true, latencyMs: 22 };
      },
      async *chatStream() {
        throw new Error("provider unavailable");
      }
    };
    const backup: AIProvider = {
      id: "backup",
      label: "Backup",
      kind: "local",
      async healthCheck() {
        return { ok: true, latencyMs: 4 };
      },
      async *chatStream() {
        yield "fallback-token";
      }
    };

    const router = new ProviderRouter([primary, backup]);
    const chunks: string[] = [];

    for await (const chunk of router.chatStream({ messages: [{ role: "user", content: "Need help" }] })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["fallback-token"]);
  });
});

