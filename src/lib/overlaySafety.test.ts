import { describe, expect, it } from "vitest";
import { shouldAutoHideOverlay } from "./overlaySafety";

describe("overlaySafety", () => {
  it("auto-hides only when enabled and capture exclusion is not active", () => {
    expect(shouldAutoHideOverlay({ autoHideOnScreenShare: true, captureExclusion: "enabled" })).toBe(false);
    expect(shouldAutoHideOverlay({ autoHideOnScreenShare: true, captureExclusion: "failed" })).toBe(true);
    expect(shouldAutoHideOverlay({ autoHideOnScreenShare: true, captureExclusion: "unsupported" })).toBe(true);
    expect(shouldAutoHideOverlay({ autoHideOnScreenShare: false, captureExclusion: "failed" })).toBe(false);
  });
});
