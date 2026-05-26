export function shouldHideForPrivacyShield(input: {
  captureExclusion: string;
  screenShareDetected?: boolean;
}): boolean {
  return input.screenShareDetected === true || input.captureExclusion !== "enabled";
}
