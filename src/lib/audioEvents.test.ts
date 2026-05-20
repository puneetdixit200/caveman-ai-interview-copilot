import { describe, expect, it } from "vitest";
import { applyAudioLevelEvent } from "./audioEvents";
import type { AudioDevice } from "../types/settings";

describe("audioEvents", () => {
  it("updates the matching device meter from a native audio level event", () => {
    const devices: AudioDevice[] = [
      { id: "microphone-1", label: "USB Mic", kind: "microphone", selected: true, level: 0 },
      { id: "system-1", label: "Speakers", kind: "system", selected: false, level: 0 }
    ];

    expect(
      applyAudioLevelEvent(devices, {
        source: "microphone",
        deviceId: "microphone-1",
        level: 0.72,
        rms: 0.4,
        peak: 0.72,
        sampleRateHz: 48000,
        channels: 2,
        timestampMs: 100
      })
    ).toEqual([
      { id: "microphone-1", label: "USB Mic", kind: "microphone", selected: true, level: 0.72 },
      { id: "system-1", label: "Speakers", kind: "system", selected: false, level: 0 }
    ]);
  });

  it("falls back to source kind when default device id differs from listed id", () => {
    const devices: AudioDevice[] = [
      { id: "microphone-realtek", label: "Realtek Mic", kind: "microphone", selected: true, level: 0 }
    ];

    expect(
      applyAudioLevelEvent(devices, {
        source: "microphone",
        deviceId: "default",
        level: 0.5,
        rms: 0.3,
        peak: 0.5,
        sampleRateHz: 48000,
        channels: 1,
        timestampMs: 100
      })[0].level
    ).toBe(0.5);
  });
});
