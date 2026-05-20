import type { AudioDevice, AudioSettings } from "../types/settings";

export interface AudioMeter {
  id: string;
  label: string;
  level: number;
}

export interface AudioMeterState {
  activeSources: Array<"system" | "microphone" | "virtual">;
  system?: AudioMeter;
  microphone?: AudioMeter;
  virtual?: AudioMeter;
}

export function normalizeAudioLevel(
  rawLevel: number,
  settings: Pick<AudioSettings, "gainDb" | "noiseGateDb">
): number {
  const level = clamp(rawLevel, 0, 1);
  const threshold = Math.pow(10, settings.noiseGateDb / 20);
  if (level < threshold) {
    return 0;
  }

  const gain = Math.pow(10, settings.gainDb / 20);
  return clamp(level * gain, 0, 1);
}

export function buildAudioMeters(devices: AudioDevice[], settings: AudioSettings): AudioMeterState {
  const activeSources = resolveActiveSources(settings);
  const state: AudioMeterState = { activeSources };

  for (const source of activeSources) {
    const targetId =
      source === "microphone"
        ? settings.microphoneDeviceId
        : source === "system"
          ? settings.systemDeviceId
          : settings.virtualDeviceId;
    const device = devices.find((item) => item.id === targetId && item.kind === source);
    if (!device) {
      continue;
    }

    state[source] = {
      id: device.id,
      label: device.label,
      level: normalizeAudioLevel(device.level, settings)
    };
  }

  return state;
}

function resolveActiveSources(settings: AudioSettings): AudioMeterState["activeSources"] {
  if (settings.captureMode === "dual" && settings.dualStreamEnabled) {
    return ["system", "microphone"];
  }

  if (settings.captureMode === "system") {
    return ["system"];
  }

  if (settings.captureMode === "microphone") {
    return ["microphone"];
  }

  return [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
