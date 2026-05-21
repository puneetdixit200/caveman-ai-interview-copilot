import type { AppConfig } from "./appConfig";
import type { AudioCaptureState, AudioLevelEvent } from "./audioEvents";
import { onAudioLevel, startCapture, stopCapture } from "./tauri";

type RehearsalSource = "microphone" | "system";
type RehearsalStatus = "ready" | "warning" | "blocked";

export interface AudioRehearsalResult {
  status: RehearsalStatus;
  started: boolean;
  durationMs: number;
  expectedSources: RehearsalSource[];
  microphonePeak: number;
  systemPeak: number;
  microphoneEvents: number;
  systemEvents: number;
  microphoneReady: boolean;
  systemReady: boolean;
  warnings: string[];
  message: string;
}

interface AudioRehearsalDeps {
  onAudioLevel: typeof onAudioLevel;
  startCapture: typeof startCapture;
  stopCapture: typeof stopCapture;
  wait: (durationMs: number) => Promise<void>;
}

export async function runAudioCaptureRehearsal(input: {
  config: AppConfig;
  durationMs?: number;
  minPeak?: number;
  deps?: Partial<AudioRehearsalDeps>;
}): Promise<AudioRehearsalResult> {
  const durationMs = Math.max(250, input.durationMs ?? 3000);
  const minPeak = Math.max(0, input.minPeak ?? 0.02);
  const expectedSources = expectedCaptureSources(input.config);

  if (expectedSources.length === 0) {
    return {
      status: "blocked",
      started: false,
      durationMs,
      expectedSources,
      microphonePeak: 0,
      systemPeak: 0,
      microphoneEvents: 0,
      systemEvents: 0,
      microphoneReady: false,
      systemReady: false,
      warnings: ["Manual transcript mode does not start native capture."],
      message: "Choose Microphone, System, or Dual capture mode before running audio rehearsal."
    };
  }

  const deps: AudioRehearsalDeps = {
    onAudioLevel: input.deps?.onAudioLevel ?? onAudioLevel,
    startCapture: input.deps?.startCapture ?? startCapture,
    stopCapture: input.deps?.stopCapture ?? stopCapture,
    wait: input.deps?.wait ?? wait
  };
  const levels = createLevelAccumulator();
  let cleanup: (() => void) | undefined;
  let started: AudioCaptureState | undefined;
  let stopped = false;

  try {
    cleanup = await deps.onAudioLevel((event) => {
      recordLevelEvent(levels, event);
    });
    started = await deps.startCapture({
      captureMode: input.config.audio.captureMode,
      dualStreamEnabled: input.config.audio.dualStreamEnabled,
      systemDeviceId: input.config.audio.systemDeviceId,
      microphoneDeviceId: input.config.audio.microphoneDeviceId,
      applicationTargetId: input.config.audio.applicationTargetId,
      applicationTargetLabel: input.config.audio.applicationTargetLabel,
      gainDb: input.config.audio.gainDb,
      noiseGateDb: input.config.audio.noiseGateDb
    });

    if (!started.running) {
      return buildResult({
        started: false,
        startedState: started,
        durationMs,
        expectedSources,
        levels,
        minPeak,
        extraWarnings: [started.error ?? "Native capture did not start."]
      });
    }

    await deps.wait(durationMs);
    const stoppedState = await deps.stopCapture();
    stopped = true;
    return buildResult({
      started: true,
      startedState: started,
      stoppedState,
      durationMs,
      expectedSources,
      levels,
      minPeak
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildResult({
      started: Boolean(started?.running),
      startedState: started,
      durationMs,
      expectedSources,
      levels,
      minPeak,
      extraWarnings: [message]
    });
  } finally {
    cleanup?.();
    if (started?.running && !stopped) {
      await deps.stopCapture().catch(() => undefined);
    }
  }
}

function expectedCaptureSources(config: AppConfig): RehearsalSource[] {
  if (config.audio.captureMode === "manual") {
    return [];
  }

  if (config.audio.captureMode === "microphone") {
    return ["microphone"];
  }

  if (config.audio.captureMode === "system") {
    return ["system"];
  }

  return config.audio.dualStreamEnabled ? ["microphone", "system"] : ["microphone"];
}

function createLevelAccumulator() {
  return {
    microphonePeak: 0,
    systemPeak: 0,
    microphoneEvents: 0,
    systemEvents: 0
  };
}

function recordLevelEvent(levels: ReturnType<typeof createLevelAccumulator>, event: AudioLevelEvent) {
  const peak = Math.max(0, Math.min(1, event.peak || event.level || 0));
  if (event.source === "microphone") {
    levels.microphonePeak = Math.max(levels.microphonePeak, peak);
    levels.microphoneEvents += 1;
  }

  if (event.source === "system") {
    levels.systemPeak = Math.max(levels.systemPeak, peak);
    levels.systemEvents += 1;
  }
}

function buildResult(input: {
  started: boolean;
  startedState?: AudioCaptureState;
  stoppedState?: AudioCaptureState;
  durationMs: number;
  expectedSources: RehearsalSource[];
  levels: ReturnType<typeof createLevelAccumulator>;
  minPeak: number;
  extraWarnings?: string[];
}): AudioRehearsalResult {
  const microphonePeak = Math.max(
    input.levels.microphonePeak,
    input.startedState?.microphoneLevel ?? 0,
    input.stoppedState?.microphoneLevel ?? 0
  );
  const systemPeak = Math.max(
    input.levels.systemPeak,
    input.startedState?.systemLevel ?? 0,
    input.stoppedState?.systemLevel ?? 0
  );
  const expectsMicrophone = input.expectedSources.includes("microphone");
  const expectsSystem = input.expectedSources.includes("system");
  const microphoneReady = !expectsMicrophone || microphonePeak >= input.minPeak;
  const systemReady = !expectsSystem || systemPeak >= input.minPeak;
  const warnings = [
    ...(expectsMicrophone && !microphoneReady ? ["Microphone did not report a usable level."] : []),
    ...(expectsSystem && !systemReady ? ["System audio did not report a usable level."] : []),
    ...(expectsSystem && input.startedState?.systemCaptureSupported === false
      ? [input.startedState.error ?? "System audio loopback is not confirmed on this device."]
      : []),
    ...(input.extraWarnings ?? [])
  ].filter((warning, index, all) => warning.trim() && all.indexOf(warning) === index);
  const status: RehearsalStatus = !input.started || warnings.some((warning) => warning.includes("did not start"))
    ? "blocked"
    : warnings.length > 0
      ? "warning"
      : "ready";

  return {
    status,
    started: input.started,
    durationMs: input.durationMs,
    expectedSources: input.expectedSources,
    microphonePeak,
    systemPeak,
    microphoneEvents: input.levels.microphoneEvents,
    systemEvents: input.levels.systemEvents,
    microphoneReady,
    systemReady,
    warnings,
    message: buildMessage(input.expectedSources, microphoneReady, systemReady, warnings, input.started)
  };
}

function buildMessage(
  expectedSources: RehearsalSource[],
  microphoneReady: boolean,
  systemReady: boolean,
  warnings: string[],
  started: boolean
): string {
  if (!started) {
    return warnings[0] ?? "Audio rehearsal could not start native capture.";
  }

  if (warnings.length > 0) {
    return warnings[0];
  }

  const labels = expectedSources.map((source) => (source === "microphone" ? "microphone" : "system audio"));
  if (labels.length === 2 && microphoneReady && systemReady) {
    return "Audio rehearsal detected microphone and system audio.";
  }

  return `Audio rehearsal detected ${labels[0]}.`;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
