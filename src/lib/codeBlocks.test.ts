import { describe, expect, it } from "vitest";
import { extractCodeBlocks } from "./codeBlocks";

describe("codeBlocks", () => {
  it("extracts fenced code blocks with language labels", () => {
    const blocks = extractCodeBlocks("Use this:\n```ts\nconst answer = 42;\n```\nThen explain why.\n```\nplain\n```");

    expect(blocks).toEqual([
      { language: "ts", code: "const answer = 42;" },
      { language: "text", code: "plain" }
    ]);
  });
});
