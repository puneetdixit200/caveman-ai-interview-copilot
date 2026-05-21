import type { Speaker } from "../types/session";
import type { SpeakerCalibrationSettings } from "../types/settings";

export const DEFAULT_SPEAKER_CALIBRATION: SpeakerCalibrationSettings = {
  systemAudioSpeaker: "interviewer",
  microphoneSpeaker: "candidate",
  providerSpeaker0: "interviewer",
  providerSpeaker1: "candidate",
  preferProviderDiarization: true
};

export function resolveCalibratedSpeaker(input: {
  speaker: Speaker;
  source?: "microphone" | "system" | string;
  providerSpeaker?: string;
  calibration?: SpeakerCalibrationSettings;
}): Speaker {
  const calibration = input.calibration ?? DEFAULT_SPEAKER_CALIBRATION;
  const providerSpeaker = parseProviderSpeaker(input.providerSpeaker);

  if (calibration.preferProviderDiarization && providerSpeaker === 0) {
    return calibration.providerSpeaker0;
  }

  if (calibration.preferProviderDiarization && providerSpeaker === 1) {
    return calibration.providerSpeaker1;
  }

  if (input.speaker !== "unknown") {
    return input.speaker;
  }

  if (input.source === "system") {
    return calibration.systemAudioSpeaker;
  }

  if (input.source === "microphone") {
    return calibration.microphoneSpeaker;
  }

  return input.speaker;
}

function parseProviderSpeaker(value: string | undefined): 0 | 1 | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\[\]]/g, "");
  if (!normalized) {
    return undefined;
  }

  if (normalized === "a") {
    return 0;
  }

  if (normalized === "b") {
    return 1;
  }

  const match = /^(?:speaker[_\s-]?)?0*([01])$/.exec(normalized);
  if (!match) {
    return undefined;
  }

  return match[1] === "0" ? 0 : 1;
}
