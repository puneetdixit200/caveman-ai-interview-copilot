import { describe, expect, it } from "vitest";
import { buildAudioMeters, normalizeAudioLevel } from "./audioPipeline";
import type { AudioDevice, AudioSettings } from "../types/settings";

const settings: AudioSettings = {
  captureMode: "dual",
  dualStreamEnabled: true,
  systemDeviceId: "speaker-loopback",
  microphoneDeviceId: "mic-1",
  virtualDeviceId: "virtual-1",
  applicationTargetId: "all-system-audio",
  applicationTargetLabel: "All system audio",
  noiseGateDb: -40,
  gainDb: 6,
  sttMode: "local_whisper",
  meterSmoothing: 0.4
};

describe("audioPipeline", () => {
  it("applies noise gate and gain while clamping meter levels", () => {
    expect(normalizeAudioLevel(0.001, { gainDb: 6, noiseGateDb: -40 })).toBe(0);
    expect(normalizeAudioLevel(0.4, { gainDb: 6, noiseGateDb: -40 })).toBeCloseTo(0.798, 3);
    expect(normalizeAudioLevel(0.9, { gainDb: 12, noiseGateDb: -80 })).toBe(1);
  });

  it("builds separate microphone and system meters for dual stream capture", () => {
    const devices: AudioDevice[] = [
      { id: "speaker-loopback", label: "Speaker Loopback", kind: "system", selected: true, level: 0.2 },
      { id: "mic-1", label: "USB Mic", kind: "microphone", selected: true, level: 0.5 },
      { id: "virtual-1", label: "Virtual Cable", kind: "virtual", selected: false, level: 0.9 }
    ];

    expect(buildAudioMeters(devices, settings)).toEqual({
      activeSources: ["system", "microphone"],
      system: expect.objectContaining({ id: "speaker-loopback", level: expect.closeTo(0.399, 3) }),
      microphone: expect.objectContaining({ id: "mic-1", level: expect.closeTo(0.998, 3) })
    });
  });
});
