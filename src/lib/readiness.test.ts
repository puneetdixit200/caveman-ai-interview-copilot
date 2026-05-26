import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG, type AppConfig } from "./appConfig";
import { evaluateRealUseReadiness } from "./readiness";
import type { AudioDevice } from "../types/settings";

const devices: AudioDevice[] = [
  {
    id: "microphone-default",
    label: "Default microphone",
    kind: "microphone",
    selected: true,
    level: 0
  },
  {
    id: "system-default",
    label: "Default system output",
    kind: "system",
    selected: true,
    level: 0
  }
];

describe("evaluateRealUseReadiness", () => {
  it("marks a configured local offline interview setup as ready", () => {
    const readiness = evaluateRealUseReadiness({
      config: mergeConfig({
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "dual",
          dualStreamEnabled: true,
          microphoneDeviceId: "microphone-default",
          systemDeviceId: "system-default"
        },
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "local_whisper",
          localWhisperBinaryPath: "C:\\tools\\whisper-cli.exe",
          localWhisperModelPath: "C:\\models\\ggml-base.en.bin"
        },
        autoTrigger: {
          ...DEFAULT_APP_CONFIG.autoTrigger,
          mode: "suggest_on_question"
        },
        security: {
          ...DEFAULT_APP_CONFIG.security,
          localOnlyMode: true
        },
        overlay: {
          ...DEFAULT_APP_CONFIG.overlay,
          autoHideOnScreenShare: true
        }
      }),
      audioDevices: devices,
      overlayProtection: { captureExclusion: "enabled" },
      runtimeBudget: {
        startupMs: 1200,
        workingSetMb: 220,
        processCpuPercent: 3,
        startupTargetMs: 3000,
        memoryTargetMb: 500,
        idleCpuTargetPercent: 15,
        activeCpuTargetPercent: 40
      }
    });

    expect(readiness.overallStatus).toBe("ready");
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.warningCount).toBe(0);
    expect(readiness.items.map((item) => item.id)).toEqual([
      "audio",
      "stt",
      "provider",
      "automation",
      "overlay",
      "privacy",
      "performance",
      "distribution"
    ]);
    expect(readiness.items.find((item) => item.id === "distribution")).toMatchObject({
      status: "ready",
      label: "Signed updates required"
    });
  });

  it("treats the screen-share privacy shield as enforced even when the legacy auto-hide setting is off", () => {
    const readiness = evaluateRealUseReadiness({
      config: mergeConfig({
        overlay: {
          ...DEFAULT_APP_CONFIG.overlay,
          autoHideOnScreenShare: false
        }
      }),
      audioDevices: devices,
      overlayProtection: { captureExclusion: "enabled" }
    });

    expect(readiness.items.find((item) => item.id === "overlay")).toMatchObject({
      status: "ready",
      label: "Screen-share privacy shield ready",
      detail: "Capture exclusion is enabled and screen-share hiding is enforced."
    });
  });

  it("warns when the app is still configured for manual transcript use", () => {
    const readiness = evaluateRealUseReadiness({
      config: mergeConfig({
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "manual",
          dualStreamEnabled: false,
          sttMode: "manual"
        },
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "manual"
        },
        autoTrigger: {
          ...DEFAULT_APP_CONFIG.autoTrigger,
          mode: "manual"
        },
        security: {
          ...DEFAULT_APP_CONFIG.security,
          localOnlyMode: false
        }
      }),
      audioDevices: devices
    });

    expect(readiness.overallStatus).toBe("warning");
    expect(readiness.warningCount).toBeGreaterThanOrEqual(3);
    expect(readiness.items.find((item) => item.id === "audio")).toMatchObject({
      status: "warning",
      action: "Switch Audio capture mode to Microphone, System, or Dual before a live call."
    });
    expect(readiness.items.find((item) => item.id === "stt")).toMatchObject({
      status: "warning",
      label: "Manual transcript mode"
    });
  });

  it("blocks a cloud-only setup when local-only mode forbids cloud calls", () => {
    const readiness = evaluateRealUseReadiness({
      config: mergeConfig({
        selectedProviderId: "openrouter",
        providers: DEFAULT_APP_CONFIG.providers.map((provider) => ({
          ...provider,
          enabled: provider.id === "openrouter",
          apiKeyStored: provider.id === "openrouter"
        })),
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "system",
          systemDeviceId: "system-default"
        },
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "deepgram",
          apiKeyStored: true
        },
        security: {
          ...DEFAULT_APP_CONFIG.security,
          localOnlyMode: true,
          blockCloudWhenLocalOnly: true
        }
      }),
      audioDevices: devices,
      overlayProtection: { captureExclusion: "enabled" }
    });

    expect(readiness.overallStatus).toBe("blocked");
    expect(readiness.items.find((item) => item.id === "provider")).toMatchObject({
      status: "blocked",
      action: "Enable a local provider or turn off local-only blocking before using cloud AI."
    });
    expect(readiness.items.find((item) => item.id === "stt")).toMatchObject({
      status: "blocked",
      action: "Use Local Whisper or turn off local-only blocking before using cloud STT."
    });
  });

  it("blocks missing cloud STT keys and missing local Whisper paths", () => {
    const missingWhisper = evaluateRealUseReadiness({
      config: mergeConfig({
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "local_whisper",
          localWhisperBinaryPath: "",
          localWhisperModelPath: "C:\\models\\ggml-base.en.bin"
        }
      }),
      audioDevices: devices
    });
    const missingCloudKey = evaluateRealUseReadiness({
      config: mergeConfig({
        stt: {
          ...DEFAULT_APP_CONFIG.stt,
          selectedMode: "google",
          apiKeyStored: false,
          apiKey: ""
        },
        security: {
          ...DEFAULT_APP_CONFIG.security,
          localOnlyMode: false
        }
      }),
      audioDevices: devices
    });

    expect(missingWhisper.items.find((item) => item.id === "stt")).toMatchObject({
      status: "blocked",
      action: "Set both Whisper binary and ggml model paths, or run Auto Detect Whisper."
    });
    expect(missingCloudKey.items.find((item) => item.id === "stt")).toMatchObject({
      status: "blocked",
      action: "Save a Google STT key in the OS keychain before starting cloud STT."
    });
  });

  it("treats a selected virtual cable as a valid live audio source", () => {
    const readiness = evaluateRealUseReadiness({
      config: mergeConfig({
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "system",
          systemDeviceId: "virtual-blackhole"
        }
      }),
      audioDevices: [
        {
          id: "virtual-blackhole",
          label: "BlackHole 2ch",
          kind: "virtual",
          selected: true,
          level: 0
        }
      ]
    });

    expect(readiness.items.find((item) => item.id === "audio")).toMatchObject({
      status: "ready",
      label: "System capture ready"
    });
  });

  it("warns when runtime budgets have not been measured yet", () => {
    const readiness = evaluateRealUseReadiness({
      config: mergeConfig({
        audio: {
          ...DEFAULT_APP_CONFIG.audio,
          captureMode: "microphone",
          microphoneDeviceId: "microphone-default"
        }
      }),
      audioDevices: devices
    });

    expect(readiness.items.find((item) => item.id === "performance")).toMatchObject({
      status: "warning",
      action: "Refresh Runtime Budget in Settings after launch and before a live interview."
    });
  });

  it("warns when runtime budgets exceed the documented real-use targets", () => {
    const readiness = evaluateRealUseReadiness({
      config: DEFAULT_APP_CONFIG,
      audioDevices: devices,
      runtimeBudget: {
        startupMs: 4200,
        workingSetMb: 640,
        processCpuPercent: 21,
        startupTargetMs: 3000,
        memoryTargetMb: 500,
        idleCpuTargetPercent: 15,
        activeCpuTargetPercent: 40
      }
    });

    expect(readiness.items.find((item) => item.id === "performance")).toMatchObject({
      label: "Runtime budget over target",
      status: "warning",
      detail: expect.stringContaining("startup 4200ms > 3000ms")
    });
  });

  it("warns when signed updates are not required for redistributable builds", () => {
    const readiness = evaluateRealUseReadiness({
      config: mergeConfig({
        security: {
          ...DEFAULT_APP_CONFIG.security,
          signedUpdatesRequired: false
        }
      }),
      audioDevices: devices
    });

    expect(readiness.items.find((item) => item.id === "distribution")).toMatchObject({
      label: "Signed updates optional",
      status: "warning",
      action: "Require signed updates and ship installers only from the signed release workflow."
    });
  });
});

function mergeConfig(patch: Partial<AppConfig>): AppConfig {
  return {
    ...DEFAULT_APP_CONFIG,
    ...patch,
    providers: patch.providers ?? DEFAULT_APP_CONFIG.providers.map((provider) => ({ ...provider })),
    audio: { ...DEFAULT_APP_CONFIG.audio, ...patch.audio },
    stt: {
      ...DEFAULT_APP_CONFIG.stt,
      ...patch.stt,
      speakerCalibration: {
        ...DEFAULT_APP_CONFIG.stt.speakerCalibration,
        ...patch.stt?.speakerCalibration
      }
    },
    autoTrigger: { ...DEFAULT_APP_CONFIG.autoTrigger, ...patch.autoTrigger },
    autoAnswer: { ...DEFAULT_APP_CONFIG.autoAnswer, ...patch.autoAnswer },
    contextWindow: { ...DEFAULT_APP_CONFIG.contextWindow, ...patch.contextWindow },
    ocr: { ...DEFAULT_APP_CONFIG.ocr, ...patch.ocr },
    tts: { ...DEFAULT_APP_CONFIG.tts, ...patch.tts },
    overlay: {
      ...DEFAULT_APP_CONFIG.overlay,
      ...patch.overlay,
      bounds: {
        ...DEFAULT_APP_CONFIG.overlay.bounds,
        ...patch.overlay?.bounds
      }
    },
    shortcuts: { ...DEFAULT_APP_CONFIG.shortcuts, ...patch.shortcuts },
    security: { ...DEFAULT_APP_CONFIG.security, ...patch.security },
    plugins: { ...DEFAULT_APP_CONFIG.plugins, ...patch.plugins },
    profiles: patch.profiles ?? []
  };
}
