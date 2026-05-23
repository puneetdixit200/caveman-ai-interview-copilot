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
      confidence: 0.91,
      source: "microphone",
      language: "en"
    });
    expect(saved).toHaveLength(1);
  });

  it("deletes cached snapshot audio after a transcription pass", async () => {
    const deleteCaptureSnapshot = vi.fn(async () => true);
    const saveCaptureSnapshot = vi.fn(async () => ({
      source: "microphone" as const,
      audioPath: "C:\\tmp\\caveman-live.wav",
      sampleRateHz: 16000,
      channels: 1,
      durationMs: 1200,
      sampleCount: 19200
    }));
    const transcribeWithLocalWhisper = vi.fn(async () => []);

    await runLiveTranscriptionPass({
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
          localWhisperModelPath: "C:\\models\\ggml-base.en.bin"
        }
      },
      seenTranscriptKeys: new Set<string>(),
      saveCaptureSnapshot,
      transcribeWithLocalWhisper,
      deleteCaptureSnapshot
    });

    expect(deleteCaptureSnapshot).toHaveBeenCalledWith("C:\\tmp\\caveman-live.wav");
  });

  it("transcribes microphone and system audio separately in dual capture mode", async () => {
    const saveCaptureSnapshot = vi.fn(async (input: { source: "microphone" | "system" }) => ({
      source: input.source,
      audioPath: `C:\\tmp\\${input.source}.wav`,
      sampleRateHz: 16000,
      channels: 1,
      durationMs: 1600,
      sampleCount: 25600
    }));
    const transcribeWithLocalWhisper = vi.fn(async (input: { audioPath: string }) =>
      input.audioPath.includes("system")
        ? [
            {
              speaker: "unknown" as const,
              text: "Explain database indexes.",
              startMs: 100,
              endMs: 900,
              confidence: 0.88,
              language: "en"
            }
          ]
        : [
            {
              speaker: "unknown" as const,
              text: "I would start with the query pattern.",
              startMs: 120,
              endMs: 1200,
              confidence: 0.86,
              language: "en"
            }
          ]
    );
    const addTranscript = vi.fn(async (input) => ({
      id: input.speaker === "interviewer" ? 1 : 2,
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
          captureMode: "dual"
        },
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "local_whisper",
          localWhisperBinaryPath: "C:\\tools\\whisper.exe",
          localWhisperModelPath: "C:\\models\\ggml-base.en.bin"
        }
      },
      seenTranscriptKeys: new Set<string>(),
      saveCaptureSnapshot,
      transcribeWithLocalWhisper,
      addTranscript
    });

    expect(saveCaptureSnapshot).toHaveBeenCalledWith({ source: "system", maxSeconds: 6 });
    expect(saveCaptureSnapshot).toHaveBeenCalledWith({ source: "microphone", maxSeconds: 6 });
    expect(transcribeWithLocalWhisper).toHaveBeenCalledTimes(2);
    expect(addTranscript).toHaveBeenNthCalledWith(1, {
      sessionId: "s1",
      speaker: "interviewer",
      content: "Explain database indexes.",
      timestampMs: 100,
      confidence: 0.88,
      source: "system",
      language: "en"
    });
    expect(addTranscript).toHaveBeenNthCalledWith(2, {
      sessionId: "s1",
      speaker: "candidate",
      content: "I would start with the query pattern.",
      timestampMs: 120,
      confidence: 0.86,
      source: "microphone",
      language: "en"
    });
    expect(saved).toHaveLength(2);
  });

  it("anchors snapshot transcript timestamps to the active session clock", async () => {
    const saveCaptureSnapshot = vi.fn(async () => ({
      source: "system" as const,
      audioPath: "C:\\tmp\\system.wav",
      sampleRateHz: 16000,
      channels: 1,
      durationMs: 6000,
      sampleCount: 96000
    }));
    const transcribeWithLocalWhisper = vi.fn(async () => [
      {
        speaker: "interviewer" as const,
        text: "Walk me through your API design.",
        startMs: 1500,
        endMs: 3000,
        confidence: 0.9,
        language: "en"
      }
    ]);
    const addTranscript = vi.fn(async (input) => ({
      id: 3,
      sessionId: input.sessionId,
      speaker: input.speaker,
      content: input.content,
      timestampMs: input.timestampMs,
      confidence: input.confidence
    }));

    await runLiveTranscriptionPass({
      sessionId: "s1",
      sessionStartedAt: "2026-05-20T00:00:00.000Z",
      now: new Date("2026-05-20T00:02:00.000Z"),
      config: {
        ...DEFAULT_APP_CONFIG,
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "system"
        },
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "local_whisper",
          localWhisperBinaryPath: "C:\\tools\\whisper.exe",
          localWhisperModelPath: "C:\\models\\ggml-base.en.bin"
        }
      },
      seenTranscriptKeys: new Set<string>(),
      saveCaptureSnapshot,
      transcribeWithLocalWhisper,
      addTranscript
    });

    expect(addTranscript).toHaveBeenCalledWith({
      sessionId: "s1",
      speaker: "interviewer",
      content: "Walk me through your API design.",
      timestampMs: 115500,
      confidence: 0.9,
      source: "system",
      language: "en"
    });
  });

  it("passes auto language to snapshot cloud STT when the language setting is blank", async () => {
    const saveCaptureSnapshot = vi.fn(async () => ({
      source: "system" as const,
      audioPath: "C:\\tmp\\system.wav",
      sampleRateHz: 16000,
      channels: 1,
      durationMs: 1600,
      sampleCount: 25600
    }));
    const transcribeWithCloudStt = vi.fn(async () => [
      {
        speaker: "interviewer" as const,
        text: "What trade-offs did you make?",
        startMs: 0,
        endMs: 1200,
        confidence: 0.87,
        language: "en"
      }
    ]);
    const addTranscript = vi.fn(async (input) => ({
      id: 4,
      sessionId: input.sessionId,
      speaker: input.speaker,
      content: input.content,
      timestampMs: input.timestampMs,
      confidence: input.confidence
    }));

    await runLiveTranscriptionPass({
      sessionId: "s1",
      config: {
        ...DEFAULT_APP_CONFIG,
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "system"
        },
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "assemblyai",
          language: "",
          apiKey: "dg_key"
        }
      },
      seenTranscriptKeys: new Set<string>(),
      saveCaptureSnapshot,
      transcribeWithCloudStt,
      addTranscript
    });

    expect(transcribeWithCloudStt).toHaveBeenCalledWith({
      provider: "assemblyai",
      apiKey: "dg_key",
      audioPath: "C:\\tmp\\system.wav",
      language: "auto",
      diarizationEnabled: true,
      endpoint: undefined,
      localOnlyMode: false,
      blockCloudWhenLocalOnly: true
    });
  });

  it("blocks snapshot cloud STT while local-only mode is enabled", async () => {
    const saveCaptureSnapshot = vi.fn();
    const transcribeWithCloudStt = vi.fn();

    const saved = await runLiveTranscriptionPass({
      sessionId: "s1",
      config: {
        ...DEFAULT_APP_CONFIG,
        security: {
          ...DEFAULT_APP_CONFIG.security,
          localOnlyMode: true,
          blockCloudWhenLocalOnly: true
        },
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "system"
        },
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "assemblyai",
          apiKey: "stt_key"
        }
      },
      seenTranscriptKeys: new Set<string>(),
      saveCaptureSnapshot,
      transcribeWithCloudStt
    });

    expect(saved).toEqual([]);
    expect(saveCaptureSnapshot).not.toHaveBeenCalled();
    expect(transcribeWithCloudStt).not.toHaveBeenCalled();
  });

  it("applies speaker calibration before saving snapshot transcript events", async () => {
    const saveCaptureSnapshot = vi.fn(async () => ({
      source: "system" as const,
      audioPath: "C:\\tmp\\system.wav",
      sampleRateHz: 16000,
      channels: 1,
      durationMs: 1600,
      sampleCount: 25600
    }));
    const transcribeWithCloudStt = vi.fn(async () => [
      {
        speaker: "interviewer" as const,
        providerSpeaker: "0",
        text: "I want to add one constraint.",
        startMs: 0,
        endMs: 900,
        confidence: 0.82,
        language: "en"
      }
    ]);
    const addTranscript = vi.fn(async (input) => ({
      id: 7,
      sessionId: input.sessionId,
      speaker: input.speaker,
      content: input.content,
      timestampMs: input.timestampMs,
      confidence: input.confidence
    }));

    await runLiveTranscriptionPass({
      sessionId: "s1",
      config: {
        ...DEFAULT_APP_CONFIG,
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "system"
        },
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "assemblyai",
          apiKey: "stt_key",
          speakerCalibration: {
            ...DEFAULT_APP_CONFIG.stt.speakerCalibration,
            preferProviderDiarization: true,
            providerSpeaker0: "candidate"
          }
        }
      },
      seenTranscriptKeys: new Set<string>(),
      saveCaptureSnapshot,
      transcribeWithCloudStt,
      addTranscript
    });

    expect(addTranscript).toHaveBeenCalledWith({
      sessionId: "s1",
      speaker: "candidate",
      content: "I want to add one constraint.",
      timestampMs: 0,
      confidence: 0.82,
      source: "system",
      language: "en"
    });
  });

  it("leaves Deepgram to the live WebSocket path instead of snapshot transcription", async () => {
    const saveCaptureSnapshot = vi.fn();
    const transcribeWithCloudStt = vi.fn();

    const saved = await runLiveTranscriptionPass({
      sessionId: "s1",
      config: {
        ...DEFAULT_APP_CONFIG,
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "system"
        },
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "deepgram",
          apiKey: "dg_key"
        }
      },
      seenTranscriptKeys: new Set<string>(),
      saveCaptureSnapshot,
      transcribeWithCloudStt
    });

    expect(saved).toEqual([]);
    expect(saveCaptureSnapshot).not.toHaveBeenCalled();
    expect(transcribeWithCloudStt).not.toHaveBeenCalled();
  });
});
