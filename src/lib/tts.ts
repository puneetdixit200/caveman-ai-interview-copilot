import type { TtsSettings } from "../types/settings";

export interface TtsQueueItem {
  id: string;
  text: string;
  voice: string;
  language: string;
  rate: number;
  volume: number;
}

export function enqueueTtsResponse(
  queue: TtsQueueItem[],
  text: string,
  settings: TtsSettings,
  stealthModeActive: boolean
): TtsQueueItem[] {
  const trimmed = text.trim();
  if (!settings.enabled || !trimmed || (stealthModeActive && settings.muteInStealth)) {
    return queue;
  }

  return [
    ...queue,
    {
      id: stableQueueId(trimmed, queue.length),
      text: trimmed,
      voice: settings.voice,
      language: settings.language,
      rate: settings.rate,
      volume: settings.volume
    }
  ];
}

function stableQueueId(text: string, index: number): string {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return `tts-${index + 1}-${hash.toString(16)}`;
}
