import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG } from "./appConfig";
import { resolveCalibratedSpeaker } from "./speakerCalibration";

describe("speakerCalibration", () => {
  it("uses calibrated defaults for unknown source speakers", () => {
    expect(
      resolveCalibratedSpeaker({
        source: "system",
        speaker: "unknown",
        calibration: DEFAULT_APP_CONFIG.stt.speakerCalibration
      })
    ).toBe("interviewer");

    expect(
      resolveCalibratedSpeaker({
        source: "microphone",
        speaker: "unknown",
        calibration: DEFAULT_APP_CONFIG.stt.speakerCalibration
      })
    ).toBe("candidate");
  });

  it("uses provider diarization labels when calibration prefers provider speakers", () => {
    expect(
      resolveCalibratedSpeaker({
        source: "system",
        speaker: "interviewer",
        providerSpeaker: "0",
        calibration: {
          ...DEFAULT_APP_CONFIG.stt.speakerCalibration,
          preferProviderDiarization: true,
          providerSpeaker0: "candidate",
          providerSpeaker1: "interviewer"
        }
      })
    ).toBe("candidate");
  });

  it("ignores provider labels when calibration does not prefer them", () => {
    expect(
      resolveCalibratedSpeaker({
        source: "system",
        speaker: "unknown",
        providerSpeaker: "0",
        calibration: {
          ...DEFAULT_APP_CONFIG.stt.speakerCalibration,
          preferProviderDiarization: false,
          systemAudioSpeaker: "interviewer",
          providerSpeaker0: "candidate"
        }
      })
    ).toBe("interviewer");
  });

  it("falls back to calibrated source speakers when provider labels are missing", () => {
    expect(
      resolveCalibratedSpeaker({
        source: "microphone",
        speaker: "unknown",
        calibration: {
          ...DEFAULT_APP_CONFIG.stt.speakerCalibration,
          microphoneSpeaker: "candidate"
        }
      })
    ).toBe("candidate");
  });
});
