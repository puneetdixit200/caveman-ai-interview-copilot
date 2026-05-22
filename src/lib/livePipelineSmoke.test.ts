import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG, type AppConfig } from "./appConfig";
import { runLivePipelineSmokeCheck } from "./livePipelineSmoke";
import type { AudioLevelEvent } from "./audioEvents";

describe("runLivePipelineSmokeCheck", () => {
  it("captures a live snapshot, transcribes it, probes the AI provider, and deletes raw audio", async () => {
    let levelListener: ((event: AudioLevelEvent) => void) | undefined;
    const cleanup = vi.fn();
    const provider = {
      id: "ollama",
      label: "Ollama",
      kind: "local" as const,
      healthCheck: vi.fn(async () => ({ ok: true, latencyMs: 12 })),
      chatStream: vi.fn(async function* () {
        yield "OK";
      })
    };
    const deps = {
      onAudioLevel: vi.fn(async (callback: (event: AudioLevelEvent) => void) => {
        levelListener = callback;
        return cleanup;
      }),
      startCapture: vi.fn(async () => runningCaptureState()),
      wait: vi.fn(async () => {
        levelListener?.(levelEvent("microphone", 0.31));
      }),
      saveCaptureSnapshot: vi.fn(async () => ({
        source: "microphone",
        audioPath: "C:\\cache\\microphone-1.wav",
        sampleRateHz: 16000,
        channels: 1,
        durationMs: 900,
        sampleCount: 14400
      })),
      stopCapture: vi.fn(async () => ({ ...runningCaptureState(), running: false })),
      deleteCaptureSnapshot: vi.fn(async () => true),
      transcribeWithLocalWhisper: vi.fn(async () => [
        {
          speaker: "interviewer" as const,
          text: "How would you design retries?",
          startMs: 0,
          endMs: 900,
          confidence: 0.94,
          language: "en"
        }
      ]),
      createConfiguredProvider: vi.fn(() => provider),
      now: sequenceNow(1000, 1100, 1320, 1500)
    };

    const result = await runLivePipelineSmokeCheck({
      config: localWhisperConfig(),
      durationMs: 500,
      snapshotSeconds: 4,
      deps
    });

    expect(deps.startCapture).toHaveBeenCalledWith({
      captureMode: "microphone",
      dualStreamEnabled: false,
      systemDeviceId: "default",
      microphoneDeviceId: "microphone-default",
      applicationTargetId: "all-system-audio",
      applicationTargetLabel: "All system audio",
      gainDb: 0,
      noiseGateDb: -45
    });
    expect(deps.saveCaptureSnapshot).toHaveBeenCalledWith({ source: "microphone", maxSeconds: 4 });
    expect(deps.transcribeWithLocalWhisper).toHaveBeenCalledWith({
      binaryPath: "C:\\tools\\whisper.cpp\\main.exe",
      modelPath: "C:\\models\\ggml-base.en.bin",
      audioPath: "C:\\cache\\microphone-1.wav",
      language: "auto",
      diarizationEnabled: true
    });
    expect(provider.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 24,
        temperature: 0,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user", content: expect.stringContaining("How would you design retries?") })
        ])
      })
    );
    expect(deps.deleteCaptureSnapshot).toHaveBeenCalledWith("C:\\cache\\microphone-1.wav");
    expect(deps.stopCapture).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ready");
    expect(result.transcriptSegments).toBe(1);
    expect(result.firstAiChunk).toBe("OK");
    expect(result.items.map((item) => item.status)).toEqual(["ready", "ready", "ready"]);
  });

  it("blocks manual transcript mode without opening native capture", async () => {
    const startCapture = vi.fn();

    const result = await runLivePipelineSmokeCheck({
      config: DEFAULT_APP_CONFIG,
      deps: {
        startCapture
      }
    });

    expect(startCapture).not.toHaveBeenCalled();
    expect(result.status).toBe("blocked");
    expect(result.items[0]).toMatchObject({
      id: "audio",
      status: "blocked",
      detail: "Manual transcript mode cannot prove the live interview pipeline."
    });
  });

  it("stops capture and deletes the snapshot when STT fails", async () => {
    const deps = {
      onAudioLevel: vi.fn(async () => vi.fn()),
      startCapture: vi.fn(async () => runningCaptureState()),
      wait: vi.fn(async () => undefined),
      saveCaptureSnapshot: vi.fn(async () => ({
        source: "microphone",
        audioPath: "C:\\cache\\microphone-failed.wav",
        sampleRateHz: 16000,
        channels: 1,
        durationMs: 700,
        sampleCount: 11200
      })),
      stopCapture: vi.fn(async () => ({ ...runningCaptureState(), running: false })),
      deleteCaptureSnapshot: vi.fn(async () => true),
      transcribeWithLocalWhisper: vi.fn(async () => {
        throw new Error("whisper crashed");
      })
    };

    const result = await runLivePipelineSmokeCheck({
      config: localWhisperConfig(),
      durationMs: 500,
      deps
    });

    expect(deps.stopCapture).toHaveBeenCalledTimes(1);
    expect(deps.deleteCaptureSnapshot).toHaveBeenCalledWith("C:\\cache\\microphone-failed.wav");
    expect(result.status).toBe("blocked");
    expect(result.items.some((item) => item.id === "stt" && item.detail.includes("whisper crashed"))).toBe(true);
  });
});

function localWhisperConfig(): AppConfig {
  return {
    ...DEFAULT_APP_CONFIG,
    audio: {
      ...DEFAULT_APP_CONFIG.audio,
      captureMode: "microphone",
      microphoneDeviceId: "microphone-default",
      sttMode: "local_whisper"
    },
    stt: {
      ...DEFAULT_APP_CONFIG.stt,
      selectedMode: "local_whisper",
      localWhisperBinaryPath: "C:\\tools\\whisper.cpp\\main.exe",
      localWhisperModelPath: "C:\\models\\ggml-base.en.bin"
    }
  };
}

function runningCaptureState() {
  return {
    running: true,
    systemDeviceId: "default",
    microphoneDeviceId: "microphone-default",
    applicationTargetId: "all-system-audio",
    applicationTargetLabel: "All system audio",
    sampleRateHz: 16000,
    channels: 1,
    microphoneLevel: 0.18,
    systemLevel: 0,
    gainDb: 0,
    noiseGateDb: -45,
    systemCaptureSupported: false
  };
}

function levelEvent(source: "microphone" | "system", peak: number): AudioLevelEvent {
  return {
    source,
    deviceId: `${source}-default`,
    level: peak,
    peak,
    rms: peak / 2,
    sampleRateHz: 16000,
    channels: 1,
    timestampMs: Date.now()
  };
}

function sequenceNow(...values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
