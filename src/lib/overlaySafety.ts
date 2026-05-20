export function shouldAutoHideOverlay(input: {
  autoHideOnScreenShare: boolean;
  captureExclusion: string;
}): boolean {
  return input.autoHideOnScreenShare && input.captureExclusion !== "enabled";
}
