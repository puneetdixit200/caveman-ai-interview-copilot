import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "./appConfig";
import { runLiveTranscriptionPass } from "./liveTranscription";

describe("liveTranscription", () => {
  it("snapshots native capture, runs local Whisper, and saves transcript events", async () => {
    const saveCaptureSnapshot = vi.fn(async () => ({
      source: "microphone" as const,
      audioPath: "C:\\tmp\\caveman-live.wav",
      sampleRateHz: 16000,
      channels: 1,
      durationMs: 3200,
      sampleCount: 51200
    }));
    const transcribeWithLocalWhisper = vi.fn(async () => [
      {
        speaker: "interviewer" as const,
        text: "How would you design a cache?",
        startMs: 200,
        endMs: 1900,
        confidence: 0.91,
        language: "en"
      }
    ]);
    const addTranscript = vi.fn(async (input) => ({
      id: 9,
      sessionId: input.sessionId,
      speaker: input.speaker,
      content: input.content,
      timestampMs: input.timestampMs,
      confidence: input.confidence
    }));

    const saved = await runLiveTranscriptionPass({
      sessionId: "s1",
      config: {
        ...DEFAULT_APP_CONFIG,
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "microphone"
        },
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "local_whisper",
          localWhisperBinaryPath: "C:\\tools\\whisper.exe",
          localWhisperModelPath: "C:\\models\\ggml-base.en.bin",
          language: "auto"
        }
      },
      seenTranscriptKeys: new Set<string>(),
      saveCaptureSnapshot,
      transcribeWithLocalWhisper,
      addTranscript
    });

    expect(saveCaptureSnapshot).toHaveBeenCalledWith({ source: "microphone", maxSeconds: 6 });
    expect(transcribeWithLocalWhisper).toHaveBeenCalledWith({
      binaryPath: "C:\\tools\\whisper.exe",
      modelPath: "C:\\models\\ggml-base.en.bin",
      audioPath: "C:\\tmp\\caveman-live.wav",
      language: "auto",
      diarizationEnabled: true
    });
    expect(addTranscript).toHaveBeenCalledWith({
      sessionId: "s1",
      speaker: "interviewer",
      content: "How would you design a cache?",
      timestampMs: 200,
      confidence: 0.91
    });
    expect(saved).toHaveLength(1);
  });
});
