import { describe, expect, it } from "vitest";
import {
  PRIVACY_SHIELD_RESTORE_CLEAR_CHECKS,
  shouldHideForPrivacyShield,
  shouldRestoreAfterPrivacyShieldClear
} from "./overlaySafety";

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

  it("requires repeated clear checks before restoring after privacy risk", () => {
    expect(shouldRestoreAfterPrivacyShieldClear({ hadRecentRisk: false, consecutiveClearChecks: 0 })).toBe(true);
    expect(shouldRestoreAfterPrivacyShieldClear({ hadRecentRisk: true, consecutiveClearChecks: 0 })).toBe(false);
    expect(
      shouldRestoreAfterPrivacyShieldClear({
        hadRecentRisk: true,
        consecutiveClearChecks: PRIVACY_SHIELD_RESTORE_CLEAR_CHECKS - 1
      })
    ).toBe(false);
    expect(
      shouldRestoreAfterPrivacyShieldClear({
        hadRecentRisk: true,
        consecutiveClearChecks: PRIVACY_SHIELD_RESTORE_CLEAR_CHECKS
      })
    ).toBe(true);
  });
});
