import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "./appConfig";
import { runAudioCaptureRehearsal } from "./audioRehearsal";
import type { AudioLevelEvent } from "./audioEvents";

describe("runAudioCaptureRehearsal", () => {
  it("does not start native capture while manual transcript mode is selected", async () => {
    const startCapture = vi.fn();

    const result = await runAudioCaptureRehearsal({
      config: DEFAULT_APP_CONFIG,
      deps: {
        startCapture
      }
    });

    expect(startCapture).not.toHaveBeenCalled();
    expect(result.started).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.message).toBe("Choose Microphone, System, or Dual capture mode before running audio rehearsal.");
  });

  it("starts dual capture, samples live meter events, and reports detected peaks", async () => {
    let listener: ((event: AudioLevelEvent) => void) | undefined;
    const cleanup = vi.fn();
    const onAudioLevel = vi.fn(async (callback: (event: AudioLevelEvent) => void) => {
      listener = callback;
      return cleanup;
    });
    const startCapture = vi.fn(async () => ({
      running: true,
      systemDeviceId: "system-default",
      microphoneDeviceId: "microphone-default",
      applicationTargetId: "all-system-audio",
      applicationTargetLabel: "All system audio",
      sampleRateHz: 16000,
      channels: 1,
      microphoneLevel: 0,
      systemLevel: 0,
      gainDb: 3,
      noiseGateDb: -45,
      systemCaptureSupported: true
    }));
    const stopCapture = vi.fn(async () => ({
      running: false,
      systemDeviceId: "system-default",
      microphoneDeviceId: "microphone-default",
      applicationTargetId: "all-system-audio",
      applicationTargetLabel: "All system audio",
      sampleRateHz: 16000,
      channels: 1,
      microphoneLevel: 0,
      systemLevel: 0,
      gainDb: 3,
      noiseGateDb: -45,
      systemCaptureSupported: true
    }));
    const wait = vi.fn(async () => {
      listener?.(levelEvent("microphone", 0.24));
      listener?.(levelEvent("system", 0.36));
    });

    const result = await runAudioCaptureRehearsal({
      config: {
        ...DEFAULT_APP_CONFIG,
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "dual",
          dualStreamEnabled: true,
          microphoneDeviceId: "microphone-default",
          systemDeviceId: "system-default",
          gainDb: 3,
          noiseGateDb: -45
        }
      },
      durationMs: 500,
      deps: {
        onAudioLevel,
        startCapture,
        stopCapture,
        wait
      }
    });

    expect(startCapture).toHaveBeenCalledWith({
      captureMode: "dual",
      dualStreamEnabled: true,
      systemDeviceId: "system-default",
      microphoneDeviceId: "microphone-default",
      applicationTargetId: "all-system-audio",
      applicationTargetLabel: "All system audio",
      gainDb: 3,
      noiseGateDb: -45
    });
    expect(wait).toHaveBeenCalledWith(500);
    expect(stopCapture).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ready");
    expect(result.microphonePeak).toBe(0.24);
    expect(result.systemPeak).toBe(0.36);
    expect(result.message).toBe("Audio rehearsal detected microphone and system audio.");
  });

  it("warns when expected system audio never reports a usable level", async () => {
    let listener: ((event: AudioLevelEvent) => void) | undefined;
    const onAudioLevel = vi.fn(async (callback: (event: AudioLevelEvent) => void) => {
      listener = callback;
      return vi.fn();
    });

    const result = await runAudioCaptureRehearsal({
      config: {
        ...DEFAULT_APP_CONFIG,
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "system",
          systemDeviceId: "system-default"
        }
      },
      deps: {
        onAudioLevel,
        startCapture: vi.fn(async () => ({
          running: true,
          systemDeviceId: "system-default",
          microphoneDeviceId: "",
          sampleRateHz: 16000,
          channels: 1,
          microphoneLevel: 0,
          systemLevel: 0,
          gainDb: 0,
          noiseGateDb: -80,
          systemCaptureSupported: false,
          error: "system audio loopback is unavailable"
        })),
        stopCapture: vi.fn(async () => ({
          running: false,
          systemDeviceId: "system-default",
          microphoneDeviceId: "",
          sampleRateHz: 16000,
          channels: 1,
          microphoneLevel: 0,
          systemLevel: 0,
          gainDb: 0,
          noiseGateDb: -80,
          systemCaptureSupported: false
        })),
        wait: vi.fn(async () => {
          listener?.(levelEvent("microphone", 0.4));
        })
      }
    });

    expect(result.status).toBe("warning");
    expect(result.systemReady).toBe(false);
    expect(result.warnings).toContain("System audio did not report a usable level.");
    expect(result.warnings).toContain("system audio loopback is unavailable");
  });
});

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
