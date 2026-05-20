import { describe, expect, it } from "vitest";
import { canSendOcrContext, normalizeOcrText } from "./ocr";
import type { OcrSettings } from "../types/settings";

describe("ocr", () => {
  it("normalizes OCR output into compact reviewable text", () => {
    expect(normalizeOcrText("  Design   a URL\n\n shortener   \nwith Redis  ")).toBe(
      "Design a URL\nshortener\nwith Redis"
    );
  });

  it("blocks cloud OCR context when review is required or local-only mode is on", () => {
    const settings: OcrSettings = {
      enabled: true,
      provider: "local_tesseract",
      includeInPrompt: true,
      reviewBeforeSend: true
    };

    expect(canSendOcrContext({ settings, reviewed: false, providerKind: "local", localOnlyMode: false })).toBe(false);
    expect(canSendOcrContext({ settings, reviewed: true, providerKind: "cloud", localOnlyMode: true })).toBe(false);
    expect(canSendOcrContext({ settings, reviewed: true, providerKind: "local", localOnlyMode: true })).toBe(true);
  });
});
