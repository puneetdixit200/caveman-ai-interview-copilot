import type { Speaker, SttTranscriptEvent } from "../types/session";
import type { AudioChunkEvent } from "./audioEvents";
import { transcribeLocalWhisperPcm } from "./tauri";

export type TranscriptSource = "microphone" | "system";

export interface LocalWhisperPcmTranscribeInput {
  binaryPath: string;
  modelPath: string;
  pcm16Base64: string;
  sampleRateHz: number;
  channels: number;
  language?: string;
  diarizationEnabled?: boolean;
}

interface BufferedChunk {
  event: AudioChunkEvent;
  startMs: number;
  endMs: number;
}

export interface LocalWhisperJsonlSidecarStartInput {
  binaryPath: string;
  modelPath: string;
  source: TranscriptSource;
  sampleRateHz: number;
  channels: number;
  language: string;
  diarizationEnabled: boolean;
}

export interface LocalWhisperJsonlSidecarTransport {
  start(input: LocalWhisperJsonlSidecarStartInput, onLine: (line: string) => void): Promise<void>;
  writeLine(line: string): Promise<void>;
  close(): Promise<void>;
}

export interface LocalWhisperJsonlTranscriptEvent extends SttTranscriptEvent {
  isFinal: boolean;
}

export interface LocalWhisperJsonlStreamTranscriberInput {
  source: TranscriptSource;
  binaryPath: string;
  modelPath: string;
  language: string;
  diarizationEnabled: boolean;
  transport: LocalWhisperJsonlSidecarTransport;
  onTranscript: (event: SttTranscriptEvent) => void;
  onInterimTranscript?: (event: LocalWhisperJsonlTranscriptEvent) => void;
  onStatus?: (message: string) => void;
  onError?: (error: Error) => void;
}

interface LocalWhisperChunkTranscriberInput {
  source: TranscriptSource;
  binaryPath: string;
  modelPath: string;
  language: string;
  diarizationEnabled: boolean;
  windowMs?: number;
  overlapMs?: number;
  transcribePcm?: (input: LocalWhisperPcmTranscribeInput) => Promise<SttTranscriptEvent[]>;
  onTranscript: (event: SttTranscriptEvent) => void;
  onStatus?: (message: string) => void;
  onError?: (error: Error) => void;
}

export class LocalWhisperChunkTranscriber {
  private readonly windowMs: number;
  private readonly overlapMs: number;
  private readonly transcribePcm: (input: LocalWhisperPcmTranscribeInput) => Promise<SttTranscriptEvent[]>;
  private chunks: BufferedChunk[] = [];
  private nextChunkStartMs = 0;
  private activeFlush?: Promise<void>;
  private closed = false;

  constructor(private readonly input: LocalWhisperChunkTranscriberInput) {
    this.windowMs = Math.max(250, input.windowMs ?? 5000);
    this.overlapMs = Math.max(0, Math.min(input.overlapMs ?? 1000, this.windowMs - 1));
    this.transcribePcm = input.transcribePcm ?? transcribeLocalWhisperPcm;
  }

  sendChunk(chunk: AudioChunkEvent) {
    if (this.closed || chunk.source !== this.input.source || chunk.sampleRateHz !== 16000 || chunk.channels !== 1) {
      return;
    }

    const durationMs = Math.max(1, Math.round(chunk.durationMs));
    const buffered: BufferedChunk = {
      event: chunk,
      startMs: this.nextChunkStartMs,
      endMs: this.nextChunkStartMs + durationMs
    };
    this.nextChunkStartMs = buffered.endMs;
    this.chunks.push(buffered);

    if (this.bufferedDurationMs() >= this.windowMs) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.activeFlush) {
      return this.activeFlush;
    }

    if (this.closed || this.chunks.length === 0 || this.bufferedDurationMs() < 250) {
      return;
    }

    const chunksForPass = [...this.chunks];
    const windowStartMs = chunksForPass[0]?.startMs ?? 0;
    const windowEndMs = chunksForPass[chunksForPass.length - 1]?.endMs ?? windowStartMs;
    const pcm16Base64 = concatenatePcm16Base64(chunksForPass.map((chunk) => chunk.event.pcm16Base64));

    this.activeFlush = this.transcribePcm({
      binaryPath: this.input.binaryPath,
      modelPath: this.input.modelPath,
      pcm16Base64,
      sampleRateHz: 16000,
      channels: 1,
      language: this.input.language || "auto",
      diarizationEnabled: this.input.diarizationEnabled
    })
      .then((events) => {
        for (const event of events) {
          this.input.onTranscript({
            ...event,
            speaker: event.speaker || speakerForSource(this.input.source),
            startMs: windowStartMs + Math.max(0, Math.round(event.startMs)),
            endMs: windowStartMs + Math.max(0, Math.round(event.endMs))
          });
        }
        this.input.onStatus?.(`Local Whisper ${this.input.source} chunk transcribed`);
      })
      .catch((error) => {
        this.input.onError?.(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        this.trimToOverlap(windowEndMs);
        this.activeFlush = undefined;
        if (!this.closed && this.bufferedDurationMs() >= this.windowMs) {
          void this.flush();
        }
      });

    return this.activeFlush;
  }

  async close(): Promise<void> {
    await this.flush();
    this.closed = true;
    this.chunks = [];
  }

  private bufferedDurationMs(): number {
    if (this.chunks.length === 0) {
      return 0;
    }

    return this.chunks[this.chunks.length - 1].endMs - this.chunks[0].startMs;
  }

  private trimToOverlap(windowEndMs: number) {
    const keepAfterMs = windowEndMs - this.overlapMs;
    this.chunks = this.chunks.filter((chunk) => chunk.endMs > keepAfterMs);
  }
}

export class LocalWhisperJsonlStreamTranscriber {
  private started?: Promise<void>;
  private closed = false;

  constructor(private readonly input: LocalWhisperJsonlStreamTranscriberInput) {}

  async sendChunk(chunk: AudioChunkEvent): Promise<void> {
    if (this.closed || chunk.source !== this.input.source || chunk.sampleRateHz !== 16000 || chunk.channels !== 1) {
      return;
    }

    await this.ensureStarted();
    await this.input.transport.writeLine(
      JSON.stringify({
        type: "audio",
        source: chunk.source,
        sequence: chunk.sequence,
        sampleRateHz: chunk.sampleRateHz,
        channels: chunk.channels,
        durationMs: Math.max(1, Math.round(chunk.durationMs)),
        sampleCount: chunk.sampleCount,
        pcm16Base64: chunk.pcm16Base64,
        timestampMs: chunk.timestampMs
      })
    );
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    if (this.started) {
      await this.input.transport
        .writeLine(JSON.stringify({ type: "close", source: this.input.source }))
        .catch(() => undefined);
    }
    await this.input.transport.close();
  }

  private async ensureStarted(): Promise<void> {
    if (!this.started) {
      this.started = this.input.transport
        .start(
          {
            binaryPath: this.input.binaryPath,
            modelPath: this.input.modelPath,
            source: this.input.source,
            sampleRateHz: 16000,
            channels: 1,
            language: this.input.language || "auto",
            diarizationEnabled: this.input.diarizationEnabled
          },
          (line) => this.handleLine(line)
        )
        .then(() => {
          this.input.onStatus?.(`Local Whisper ${this.input.source} JSONL sidecar connected`);
        });
    }

    return this.started;
  }

  private handleLine(line: string) {
    const parsed = parseLocalWhisperJsonlEvent(line, this.input.source);
    if (!parsed) {
      return;
    }

    if (parsed.error) {
      this.input.onError?.(new Error(parsed.error));
      return;
    }

    if (!parsed.transcript) {
      return;
    }

    if (parsed.isFinal) {
      this.input.onTranscript(parsed.transcript);
      return;
    }

    this.input.onInterimTranscript?.({ ...parsed.transcript, isFinal: false });
  }
}

export function parseLocalWhisperJsonlEvent(
  line: string,
  source: TranscriptSource
): { isFinal: boolean; transcript?: SttTranscriptEvent; error?: string } | undefined {
  const parsed = parseJsonObject(line);
  if (!parsed) {
    return undefined;
  }

  const type = readString(parsed.type).toLowerCase();
  if (type === "error") {
    return { isFinal: true, error: readString(parsed.message) || "Local Whisper sidecar failed" };
  }

  if (type && !["transcript", "partial", "result", "segment"].includes(type)) {
    return undefined;
  }

  const text = readString(parsed.text).trim();
  if (!text) {
    return undefined;
  }

  const providerSpeaker = readString(parsed.speaker).trim() || undefined;
  const startMs =
    readTimestampMs(parsed.startMs) ?? readTimestampMs(parsed.timestampMs) ?? readSidecarTsMs(parsed.ts) ?? 0;
  const durationMs = readTimestampMs(parsed.durationMs);
  const endMs =
    readTimestampMs(parsed.endMs) ??
    readTimestampMs(parsed.stopMs) ??
    (durationMs !== undefined ? startMs + durationMs : startMs);
  const isFinal = type === "partial" ? false : parsed.isFinal !== false && parsed.final !== false;

  return {
    isFinal,
    transcript: {
      speaker: sidecarSpeakerToCaveman(providerSpeaker, source),
      providerSpeaker,
      text,
      startMs,
      endMs,
      confidence: readNumber(parsed.confidence),
      language: readString(parsed.language).trim() || undefined
    }
  };
}

function concatenatePcm16Base64(values: string[]): string {
  const byteArrays = values.map(base64ToBytes);
  const totalBytes = byteArrays.reduce((total, bytes) => total + bytes.length, 0);
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const bytes of byteArrays) {
    combined.set(bytes, offset);
    offset += bytes.length;
  }

  return bytesToBase64(combined);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function speakerForSource(source: TranscriptSource): Speaker {
  return source === "system" ? "interviewer" : "candidate";
}

function sidecarSpeakerToCaveman(speaker: string | undefined, source: TranscriptSource): Speaker {
  const normalized = speaker?.trim().toLowerCase();
  if (
    normalized === "interviewer" ||
    normalized === "speaker_0" ||
    normalized === "speaker0" ||
    normalized === "0"
  ) {
    return "interviewer";
  }

  if (
    normalized === "you" ||
    normalized === "candidate" ||
    normalized === "speaker_1" ||
    normalized === "speaker1" ||
    normalized === "1"
  ) {
    return "candidate";
  }

  return speakerForSource(source);
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readTimestampMs(value: unknown): number | undefined {
  const number = readNumber(value);
  return number === undefined ? undefined : Math.max(0, Math.round(number));
}

function readSidecarTsMs(value: unknown): number | undefined {
  const number = readNumber(value);
  return number === undefined ? undefined : Math.max(0, Math.round(number * 1000));
}
