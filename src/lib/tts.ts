import type { TtsSettings } from "../types/settings";

export interface TtsQueueItem {
  id: string;
  text: string;
  voice: string;
  language: string;
  rate: number;
  volume: number;
}

export interface SpeechVoiceLike {
  name: string;
  lang?: string;
}

export interface SpeechUtteranceLike {
  text: string;
  lang: string;
  rate: number;
  volume: number;
  voice?: SpeechVoiceLike | SpeechSynthesisVoice | null;
}

export interface SpeechSynthesisRuntime {
  Utterance: new (text: string) => SpeechUtteranceLike;
  synthesis: {
    getVoices: () => Array<SpeechVoiceLike | SpeechSynthesisVoice>;
    speak: (utterance: SpeechUtteranceLike) => void;
    cancel: () => void;
  };
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

export function playTtsItem(
  item: TtsQueueItem,
  runtime: SpeechSynthesisRuntime | null = getBrowserSpeechRuntime()
): boolean {
  if (!runtime || !item.text.trim()) {
    return false;
  }

  const utterance = new runtime.Utterance(item.text);
  const voices = runtime.synthesis.getVoices();
  const selectedVoice =
    voices.find((voice) => voice.name === item.voice) ??
    voices.find((voice) => voice.lang?.toLowerCase() === item.language.toLowerCase());

  utterance.lang = item.language;
  utterance.rate = clamp(item.rate, 0.5, 2);
  utterance.volume = clamp(item.volume, 0, 1);
  utterance.voice = selectedVoice ?? null;
  runtime.synthesis.speak(utterance);
  return true;
}

export function stopTtsPlayback(runtime: SpeechSynthesisRuntime | null = getBrowserSpeechRuntime()): void {
  runtime?.synthesis.cancel();
}

export function getBrowserSpeechRuntime(): SpeechSynthesisRuntime | null {
  if (typeof window === "undefined" || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    return null;
  }

  return {
    Utterance: window.SpeechSynthesisUtterance as unknown as new (text: string) => SpeechUtteranceLike,
    synthesis: {
      getVoices: () => window.speechSynthesis.getVoices(),
      speak: (utterance) => window.speechSynthesis.speak(utterance as SpeechSynthesisUtterance),
      cancel: () => window.speechSynthesis.cancel()
    }
  };
}

function stableQueueId(text: string, index: number): string {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return `tts-${index + 1}-${hash.toString(16)}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
