export function nextTranscriptTimestampMs(startedAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.round(now.getTime() - startedAt.getTime()));
}

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  return Math.max(1, Math.round(words.length * 1.3));
}

export function mergeStreamingResponse(chunks: string[]): string {
  return chunks.join("");
}
