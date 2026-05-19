export function formatTimestampMs(timestampMs: number): string {
  const minutes = Math.floor(timestampMs / 60000);
  const seconds = Math.floor((timestampMs % 60000) / 1000);
  const milliseconds = Math.floor(timestampMs % 1000);

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds
    .toString()
    .padStart(3, "0")}`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

export function formatConfidence(confidence?: number): string {
  if (confidence === undefined) {
    return "n/a";
  }

  return `${Math.round(confidence * 100)}%`;
}

