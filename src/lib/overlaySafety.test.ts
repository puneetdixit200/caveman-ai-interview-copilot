import { describe, expect, it } from "vitest";
import { shouldHideForPrivacyShield } from "./overlaySafety";

describe("overlaySafety", () => {
  it("hides for privacy when capture exclusion is not active", () => {
    expect(shouldHideForPrivacyShield({ captureExclusion: "enabled" })).toBe(false);
    expect(shouldHideForPrivacyShield({ captureExclusion: "failed" })).toBe(true);
    expect(shouldHideForPrivacyShield({ captureExclusion: "unsupported" })).toBe(true);
    expect(shouldHideForPrivacyShield({ captureExclusion: "disabled" })).toBe(true);
  });

  it("hides when a screen-sharing process is detected even if capture exclusion is active", () => {
    expect(shouldHideForPrivacyShield({ captureExclusion: "enabled", screenShareDetected: true })).toBe(true);
  });
});
