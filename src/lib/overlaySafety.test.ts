import { describe, expect, it } from "vitest";
import { shouldAutoHideOverlay } from "./overlaySafety";

describe("overlaySafety", () => {
  it("auto-hides only when enabled and capture exclusion is not active", () => {
    expect(shouldAutoHideOverlay({ autoHideOnScreenShare: true, captureExclusion: "enabled" })).toBe(false);
    expect(shouldAutoHideOverlay({ autoHideOnScreenShare: true, captureExclusion: "failed" })).toBe(true);
    expect(shouldAutoHideOverlay({ autoHideOnScreenShare: true, captureExclusion: "unsupported" })).toBe(true);
    expect(shouldAutoHideOverlay({ autoHideOnScreenShare: true, captureExclusion: "disabled" })).toBe(true);
    expect(shouldAutoHideOverlay({ autoHideOnScreenShare: false, captureExclusion: "failed" })).toBe(false);
  });

  it("auto-hides when a screen-sharing process is detected even if capture exclusion is active", () => {
    expect(
      shouldAutoHideOverlay({
        autoHideOnScreenShare: true,
        captureExclusion: "enabled",
        screenShareDetected: true
      })
    ).toBe(true);
    expect(
      shouldAutoHideOverlay({
        autoHideOnScreenShare: false,
        captureExclusion: "enabled",
        screenShareDetected: true
      })
    ).toBe(false);
  });
});
