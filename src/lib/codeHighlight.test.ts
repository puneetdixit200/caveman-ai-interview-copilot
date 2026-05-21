import { describe, expect, it } from "vitest";
import { displayLanguageLabel, highlightCode } from "./codeHighlight";

describe("codeHighlight", () => {
  it("normalizes common fence aliases into readable language labels", () => {
    expect(displayLanguageLabel("ts")).toBe("TypeScript");
    expect(displayLanguageLabel("py")).toBe("Python");
    expect(displayLanguageLabel("")).toBe("Plain Text");
  });

  it("highlights keywords, numbers, strings, and comments while preserving the code text", () => {
    const code = "const answer = 42;\n// return it\nreturn \"ok\";";
    const tokens = highlightCode(code, "ts");

    expect(tokens.map((token) => token.text).join("")).toBe(code);
    expect(tokens).toEqual(
      expect.arrayContaining([
        { type: "keyword", text: "const" },
        { type: "number", text: "42" },
        { type: "comment", text: "// return it" },
        { type: "keyword", text: "return" },
        { type: "string", text: "\"ok\"" }
      ])
    );
  });
});
