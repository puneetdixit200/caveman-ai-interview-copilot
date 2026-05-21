import type { Speaker, SttTranscriptEvent } from "../types/session";
import type { AudioChunkEvent } from "./audioEvents";

type TranscriptSource = "microphone" | "system";

export interface DeepgramLiveTranscriptEvent extends SttTranscriptEvent {
  isFinal: boolean;
  speechFinal: boolean;
}

interface DeepgramLiveUrlInput {
  language: string;
  diarizationEnabled: boolean;
  endpoint?: string;
}

interface DeepgramLiveTranscriberInput extends DeepgramLiveUrlInput {
  apiKey: string;
  source: TranscriptSource;
  WebSocketCtor?: typeof WebSocket;
  onTranscript: (event: SttTranscriptEvent) => void;
  onInterimTranscript?: (event: DeepgramLiveTranscriptEvent) => void;
  onStatus?: (message: string) => void;
  onError?: (error: Error) => void;
}

export function buildDeepgramLiveUrl(input: DeepgramLiveUrlInput): URL {
  const url = new URL(input.endpoint?.trim() || "wss://api.deepgram.com/v1/listen");
  url.searchParams.set("model", "nova-3");
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("channels", "1");
  url.searchParams.set("interim_results", "true");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("endpointing", "300");
  url.searchParams.set("utterance_end_ms", "1000");
  url.searchParams.set("vad_events", "true");
  url.searchParams.set("diarize", input.diarizationEnabled ? "true" : "false");

  const language = input.language.trim();
  if (language && language.toLowerCase() !== "auto") {
    url.searchParams.set("language", language);
  }

  return url;
}

export function parseDeepgramLiveResult(raw: string, source: TranscriptSource): SttTranscriptEvent[] {
  return parseDeepgramLiveMessage(raw, source)
    .filter((event) => event.isFinal)
    .map(({ isFinal: _isFinal, speechFinal: _speechFinal, ...event }) => event);
}

export function parseDeepgramLiveMessage(raw: string, source: TranscriptSource): DeepgramLiveTranscriptEvent[] {
  const parsed = parseJsonObject(raw);
  if (parsed?.type !== "Results") {
    return [];
  }

  const alternatives = readObject(parsed.channel)?.alternatives;
  const alternative = Array.isArray(alternatives) ? readObject(alternatives[0]) : undefined;
  const transcript = readString(alternative?.transcript).trim();
  if (!transcript) {
    return [];
  }

  const startSeconds = readNumber(parsed.start) ?? 0;
  const durationSeconds = readNumber(parsed.duration) ?? 0;
  const words = Array.isArray(alternative?.words) ? alternative.words.map(readObject).filter(Boolean) : [];
  const firstSpeaker = words
    .map((word) => readNumber(word?.speaker))
    .find((speaker): speaker is number => typeof speaker === "number");
  const languages = Array.isArray(alternative?.languages) ? alternative.languages.map(readString).filter(Boolean) : [];

  const event: DeepgramLiveTranscriptEvent = {
    speaker: deepgramSpeakerToCaveman(firstSpeaker, source),
    text: transcript,
    startMs: Math.round(startSeconds * 1000),
    endMs: Math.round((startSeconds + durationSeconds) * 1000),
    confidence: readNumber(alternative?.confidence),
    language: languages[0],
    isFinal: parsed.is_final === true,
    speechFinal: parsed.speech_final === true
  };

  if (firstSpeaker !== undefined) {
    event.providerSpeaker = String(firstSpeaker);
  }

  return [event];
}

export class DeepgramLiveTranscriber {
  private socket?: WebSocket;
  private queuedChunks: AudioChunkEvent[] = [];

  constructor(private readonly input: DeepgramLiveTranscriberInput) {}

  sendChunk(chunk: AudioChunkEvent) {
    if (chunk.source !== this.input.source || chunk.sampleRateHz !== 16000 || chunk.channels !== 1) {
      return;
    }

    const socket = this.ensureSocket();
    if (socket.readyState !== WebSocket.OPEN) {
      this.queuedChunks.push(chunk);
      return;
    }

    socket.send(base64ToArrayBuffer(chunk.pcm16Base64));
  }

  close() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "CloseStream" }));
    }
    this.socket?.close();
    this.socket = undefined;
    this.queuedChunks = [];
  }

  private ensureSocket(): WebSocket {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      return this.socket;
    }

    const WebSocketCtor = this.input.WebSocketCtor ?? WebSocket;
    const url = buildDeepgramLiveUrl(this.input);
    const socket = new WebSocketCtor(url.toString(), ["token", this.input.apiKey.trim()]);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      this.input.onStatus?.(`Deepgram ${this.input.source} stream connected`);
      const queued = this.queuedChunks.splice(0);
      for (const chunk of queued) {
        this.sendChunk(chunk);
      }
    };
    socket.onmessage = (message) => {
      if (typeof message.data !== "string") {
        return;
      }

      for (const event of parseDeepgramLiveMessage(message.data, this.input.source)) {
        if (event.isFinal) {
          this.input.onTranscript(event);
        } else {
          this.input.onInterimTranscript?.(event);
        }
      }
    };
    socket.onerror = () => {
      this.input.onError?.(new Error(`Deepgram ${this.input.source} stream failed`));
    };
    socket.onclose = () => {
      this.input.onStatus?.(`Deepgram ${this.input.source} stream closed`);
    };

    return socket;
  }
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function deepgramSpeakerToCaveman(speaker: number | undefined, source: TranscriptSource): Speaker {
  if (source === "system") {
    return "interviewer";
  }

  if (source === "microphone") {
    return "candidate";
  }

  if (speaker === 0) {
    return "interviewer";
  }

  if (speaker === 1) {
    return "candidate";
  }

  return "unknown";
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    return readObject(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
