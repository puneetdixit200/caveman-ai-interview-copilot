import { describe, expect, it } from "vitest";
import { extractCodeBlocks, extractCodeSuggestions } from "./codeBlocks";

describe("codeBlocks", () => {
  it("extracts fenced code blocks with language labels", () => {
    const blocks = extractCodeBlocks("Use this:\n```ts\nconst answer = 42;\n```\nThen explain why.\n```\nplain\n```");

    expect(blocks).toEqual([
      { language: "ts", code: "const answer = 42;" },
      { language: "text", code: "plain" }
    ]);
  });

  it("turns response code blocks into editor suggestions", () => {
    const suggestions = extractCodeSuggestions([
      {
        id: 12,
        sessionId: "s1",
        provider: "ollama",
        model: "llama3.1:8b",
        response: "```python\nprint('ok')\n```",
        createdAt: "2026-05-20T00:00:00.000Z"
      }
    ]);

    expect(suggestions).toEqual([
      {
        responseId: 12,
        provider: "ollama",
        model: "llama3.1:8b",
        language: "python",
        code: "print('ok')",
        createdAt: "2026-05-20T00:00:00.000Z"
      }
    ]);
  });
});
