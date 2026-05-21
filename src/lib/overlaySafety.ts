export function shouldAutoHideOverlay(input: {
  autoHideOnScreenShare: boolean;
  captureExclusion: string;
  screenShareDetected?: boolean;
}): boolean {
  return input.autoHideOnScreenShare && (input.screenShareDetected === true || input.captureExclusion !== "enabled");
}
