import { describe, expect, it, vi } from "vitest";
import { LocalWhisperChunkTranscriber, type LocalWhisperPcmTranscribeInput } from "./localWhisperStreaming";
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
