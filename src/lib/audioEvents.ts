import type { AudioDevice } from "../types/settings";

export interface AudioLevelEvent {
  source: AudioDevice["kind"];
  deviceId: string;
  level: number;
  rms: number;
  peak: number;
  sampleRateHz: number;
  channels: number;
  timestampMs: number;
}

export interface AudioChunkEvent {
  source: AudioDevice["kind"];
  deviceId: string;
  sequence: number;
  sampleRateHz: number;
  channels: number;
  durationMs: number;
  sampleCount: number;
  pcm16Base64: string;
  timestampMs: number;
}

export interface AudioCaptureState {
  running: boolean;
  systemDeviceId: string;
  microphoneDeviceId: string;
  sampleRateHz: number;
  channels: number;
  microphoneLevel: number;
  systemLevel: number;
  gainDb: number;
  noiseGateDb: number;
  systemCaptureSupported: boolean;
  error?: string;
}

export function applyAudioLevelEvent(devices: AudioDevice[], event: AudioLevelEvent): AudioDevice[] {
  const clampedLevel = Math.min(1, Math.max(0, event.level));
  const exactMatch = devices.some((device) => device.id === event.deviceId);

  return devices.map((device) => {
    const matches = exactMatch ? device.id === event.deviceId : device.kind === event.source && device.selected;
    return matches ? { ...device, level: clampedLevel } : device;
  });
}
