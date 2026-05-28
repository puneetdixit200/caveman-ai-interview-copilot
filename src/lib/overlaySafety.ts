export function shouldHideForPrivacyShield(input: {
  captureExclusion: string;
  screenShareDetected?: boolean;
}): boolean {
  return input.screenShareDetected === true || input.captureExclusion !== "enabled";
}

export const PRIVACY_SHIELD_RESTORE_CLEAR_CHECKS = 2;

export function shouldRestoreAfterPrivacyShieldClear(input: {
  hadRecentRisk: boolean;
  consecutiveClearChecks: number;
  requiredClearChecks?: number;
}): boolean {
  if (!input.hadRecentRisk) {
    return true;
  }

  return input.consecutiveClearChecks >= (input.requiredClearChecks ?? PRIVACY_SHIELD_RESTORE_CLEAR_CHECKS);
}
