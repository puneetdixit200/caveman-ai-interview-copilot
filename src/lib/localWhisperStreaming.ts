import type { Speaker, SttTranscriptEvent } from "../types/session";
import type { AudioChunkEvent } from "./audioEvents";
import { transcribeLocalWhisperPcm } from "./tauri";

type TranscriptSource = "microphone" | "system";

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
