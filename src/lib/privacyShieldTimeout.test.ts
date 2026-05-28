import { describe, expect, it } from "vitest";
import {
  PRIVACY_SHIELD_NATIVE_CALL_TIMEOUT_MARKER,
  privacyShieldTimeoutMessage,
  withPrivacyShieldTimeout
} from "./privacyShieldTimeout";

describe("privacy shield native call timeout", () => {
  it("returns resolved native results before the watchdog expires", async () => {
    await expect(
      withPrivacyShieldTimeout(Promise.resolve("native-ok"), "detect screen share", () => "fallback", 10)
    ).resolves.toBe("native-ok");
  });

  it("fails closed with a package-verifiable marker when a privacy command stalls", async () => {
    const result = await withPrivacyShieldTimeout(
      new Promise<string>(() => undefined),
      "detect screen share",
      (message) => message,
      5
    );

    expect(result).toContain(PRIVACY_SHIELD_NATIVE_CALL_TIMEOUT_MARKER);
    expect(result).toBe(privacyShieldTimeoutMessage("detect screen share", 5));
  });
});
