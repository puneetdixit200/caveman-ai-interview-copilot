import { describe, expect, it, vi } from "vitest";
import {
  LocalWhisperChunkTranscriber,
  LocalWhisperJsonlStreamTranscriber,
  parseLocalWhisperJsonlEvent,
  type LocalWhisperJsonlSidecarTransport,
  type LocalWhisperPcmTranscribeInput
} from "./localWhisperStreaming";
import type { AudioChunkEvent } from "./audioEvents";

describe("localWhisperStreaming", () => {
  it("buffers live PCM chunks, transcribes a Whisper window, and shifts offsets to stream time", async () => {
    const transcribePcm = vi.fn(async (_input: LocalWhisperPcmTranscribeInput) => [
      {
        speaker: "unknown" as const,
        text: "Explain link lists.",
        startMs: 250,
        endMs: 1200,
        language: "en"
      }
    ]);
    const onTranscript = vi.fn();
    const transcriber = new LocalWhisperChunkTranscriber({
      source: "system",
      binaryPath: "C:\\tools\\whisper-cli.exe",
      modelPath: "C:\\models\\ggml-base.en.bin",
      language: "auto",
      diarizationEnabled: true,
      windowMs: 750,
      overlapMs: 250,
      transcribePcm,
      onTranscript
    });

    transcriber.sendChunk(makeChunk("system", 1, [1, 2]));
    transcriber.sendChunk(makeChunk("system", 2, [3, 4]));
    transcriber.sendChunk(makeChunk("system", 3, [5, 6]));
    await transcriber.flush();

    expect(transcribePcm).toHaveBeenCalledWith({
      binaryPath: "C:\\tools\\whisper-cli.exe",
      modelPath: "C:\\models\\ggml-base.en.bin",
      pcm16Base64: bytesToBase64([1, 2, 3, 4, 5, 6]),
      sampleRateHz: 16000,
      channels: 1,
      language: "auto",
      diarizationEnabled: true
    });
    expect(onTranscript).toHaveBeenCalledWith({
      speaker: "unknown",
      text: "Explain link lists.",
      startMs: 250,
      endMs: 1200,
      language: "en"
    });
  });

  it("keeps an overlap window so the next Whisper pass has speech context", async () => {
    const transcribePcm = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          speaker: "unknown" as const,
          text: "Use a hash map.",
          startMs: 100,
          endMs: 400
        }
      ]);
    const onTranscript = vi.fn();
    const transcriber = new LocalWhisperChunkTranscriber({
      source: "microphone",
      binaryPath: "C:\\tools\\whisper-cli.exe",
      modelPath: "C:\\models\\ggml-base.en.bin",
      language: "en",
      diarizationEnabled: false,
      windowMs: 500,
      overlapMs: 250,
      transcribePcm,
      onTranscript
    });

    transcriber.sendChunk(makeChunk("microphone", 1, [1, 2]));
    transcriber.sendChunk(makeChunk("microphone", 2, [3, 4]));
    await transcriber.flush();
    transcriber.sendChunk(makeChunk("microphone", 3, [5, 6]));
    await transcriber.flush();

    expect(transcribePcm).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        pcm16Base64: bytesToBase64([3, 4, 5, 6])
      })
    );
    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Use a hash map.",
        startMs: 350,
        endMs: 650
      })
    );
  });

  it("ignores chunks from the other source and non-normalized audio", async () => {
    const transcribePcm = vi.fn(async () => []);
    const transcriber = new LocalWhisperChunkTranscriber({
      source: "system",
      binaryPath: "C:\\tools\\whisper-cli.exe",
      modelPath: "C:\\models\\ggml-base.en.bin",
      language: "en",
      diarizationEnabled: false,
      windowMs: 250,
      transcribePcm,
      onTranscript: vi.fn()
    });

    transcriber.sendChunk(makeChunk("microphone", 1, [1, 2]));
    transcriber.sendChunk({ ...makeChunk("system", 2, [3, 4]), sampleRateHz: 48000 });
    await transcriber.flush();

    expect(transcribePcm).not.toHaveBeenCalled();
  });

  it("streams live PCM chunks to a JSONL stdin sidecar transport", async () => {
    const transport = createJsonlTransport();
    const transcriber = new LocalWhisperJsonlStreamTranscriber({
      source: "system",
      binaryPath: "/opt/whisper.cpp/stream",
      modelPath: "/models/ggml-base.en.bin",
      language: "auto",
      diarizationEnabled: true,
      transport,
      onTranscript: vi.fn()
    });

    await transcriber.sendChunk(makeChunk("system", 7, [1, 2, 3, 4]));
    await transcriber.sendChunk(makeChunk("microphone", 8, [9, 10]));

    expect(transport.started).toEqual({
      binaryPath: "/opt/whisper.cpp/stream",
      modelPath: "/models/ggml-base.en.bin",
      source: "system",
      sampleRateHz: 16000,
      channels: 1,
      language: "auto",
      diarizationEnabled: true
    });
    expect(transport.lines.map((line) => JSON.parse(line))).toEqual([
      {
        type: "audio",
        source: "system",
        sequence: 7,
        sampleRateHz: 16000,
        channels: 1,
        durationMs: 250,
        sampleCount: 2,
        pcm16Base64: bytesToBase64([1, 2, 3, 4]),
        timestampMs: 2750
      }
    ]);
  });

  it("parses JSONL sidecar partial and final transcript events", async () => {
    const transport = createJsonlTransport();
    const onTranscript = vi.fn();
    const onInterimTranscript = vi.fn();
    const transcriber = new LocalWhisperJsonlStreamTranscriber({
      source: "system",
      binaryPath: "/opt/whisper.cpp/stream",
      modelPath: "/models/ggml-base.en.bin",
      language: "en",
      diarizationEnabled: true,
      transport,
      onTranscript,
      onInterimTranscript
    });

    await transcriber.sendChunk(makeChunk("system", 1, [1, 2]));
    transport.emitLine(
      JSON.stringify({
        type: "partial",
        speaker: "INTERVIEWER",
        text: "Explain hash",
        startMs: 100,
        endMs: 500,
        confidence: 0.62,
        language: "en"
      })
    );
    transport.emitLine(
      JSON.stringify({
        type: "transcript",
        speaker: "INTERVIEWER",
        text: "Explain hash maps.",
        startMs: 100,
        endMs: 900,
        confidence: 0.91,
        language: "en",
        isFinal: true
      })
    );

    expect(onInterimTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        speaker: "interviewer",
        text: "Explain hash",
        startMs: 100,
        endMs: 500,
        isFinal: false
      })
    );
    expect(onTranscript).toHaveBeenCalledWith({
      speaker: "interviewer",
      text: "Explain hash maps.",
      startMs: 100,
      endMs: 900,
      confidence: 0.91,
      language: "en",
      providerSpeaker: "INTERVIEWER"
    });
  });

  it("normalizes Caveman-compatible JSONL transcript samples from sidecars", () => {
    expect(
      parseLocalWhisperJsonlEvent(
        JSON.stringify({
          speaker: "YOU",
          text: "I would use consistent hashing.",
          ts: 4.2,
          confidence: 0.84,
          language: "en"
        }),
        "microphone"
      )
    ).toEqual({
      isFinal: true,
      transcript: {
        speaker: "candidate",
        providerSpeaker: "YOU",
        text: "I would use consistent hashing.",
        startMs: 4200,
        endMs: 4200,
        confidence: 0.84,
        language: "en"
      }
    });
  });
});

function makeChunk(source: "microphone" | "system", sequence: number, bytes: number[]): AudioChunkEvent {
  return {
    source,
    deviceId: `${source}-1`,
    sequence,
    sampleRateHz: 16000,
    channels: 1,
    durationMs: 250,
    sampleCount: bytes.length / 2,
    pcm16Base64: bytesToBase64(bytes),
    timestampMs: 1000 + sequence * 250
  };
}

function bytesToBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function createJsonlTransport(): LocalWhisperJsonlSidecarTransport & {
  started?: unknown;
  lines: string[];
  emitLine: (line: string) => void;
} {
  let onLine: ((line: string) => void) | undefined;
  return {
    lines: [],
    async start(input, callback) {
      this.started = input;
      onLine = callback;
    },
    async writeLine(line) {
      this.lines.push(line);
    },
    async close() {
      this.lines.push(JSON.stringify({ type: "closed" }));
    },
    emitLine(line) {
      onLine?.(line);
    }
  };
}
