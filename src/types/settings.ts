import type { InterviewType, Speaker } from "./session";

export type ProviderKind = "local" | "cloud";
export type ProviderId = "ollama" | "lmstudio" | "openrouter" | "openai" | "anthropic" | "groq";
export type AudioCaptureMode = "manual" | "microphone" | "system" | "dual";
export type SttMode = "manual" | "local_whisper" | "deepgram" | "assemblyai" | "google";
export type AutoTriggerMode = "manual" | "suggest_on_question" | "continuous_coach";
export type OcrProvider = "disabled" | "local_tesseract" | "windows_ocr" | "cloud";

export interface ModelProviderConfig {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  endpoint: string;
  model: string;
  enabled: boolean;
  apiKeyStored: boolean;
  apiKey?: string;
  headers?: Record<string, string>;
}

export interface AudioDevice {
  id: string;
  label: string;
  kind: "system" | "microphone" | "virtual";
  selected: boolean;
  level: number;
}

export interface AudioSettings {
  captureMode: AudioCaptureMode;
  dualStreamEnabled: boolean;
  systemDeviceId: string;
  microphoneDeviceId: string;
  virtualDeviceId?: string;
  noiseGateDb: number;
  gainDb: number;
  sttMode: SttMode;
  meterSmoothing: number;
}

export interface SttSettings {
  selectedMode: SttMode;
  language: string;
  diarizationEnabled: boolean;
  speakerCalibration: SpeakerCalibrationSettings;
  localWhisperBinaryPath: string;
  localWhisperModelPath: string;
  cloudEndpoint: string;
  apiKeyStored: boolean;
  apiKey?: string;
}

export interface SpeakerCalibrationSettings {
  systemAudioSpeaker: Speaker;
  microphoneSpeaker: Speaker;
  providerSpeaker0: Speaker;
  providerSpeaker1: Speaker;
  preferProviderDiarization: boolean;
}

export interface AutoTriggerSettings {
  mode: AutoTriggerMode;
  silenceTimeoutMs: number;
  duplicateWindowMs: number;
  minQuestionCharacters: number;
  requireInterviewerSpeaker: boolean;
}

export interface OcrSettings {
  enabled: boolean;
  provider: OcrProvider;
  includeInPrompt: boolean;
  reviewBeforeSend: boolean;
  lastText?: string;
  lastCapturedAtMs?: number;
}

export interface TtsSettings {
  enabled: boolean;
  autoPlay: boolean;
  voice: string;
  language: string;
  rate: number;
  volume: number;
  muteInStealth: boolean;
}

export interface SecuritySettings {
  localOnlyMode: boolean;
  captureExclusionEnabled: boolean;
  blockCloudWhenLocalOnly: boolean;
  signedUpdatesRequired: boolean;
}

export interface PluginSettings {
  enabled: boolean;
  directory: string;
  allowPromptTemplates: boolean;
  allowExportFormats: boolean;
  allowPracticePacks: boolean;
}

export interface OverlaySettings {
  opacity: number;
  fontSize: number;
  locked: boolean;
  hotkey: string;
  autoHideOnScreenShare: boolean;
  bounds: OverlayWindowBounds;
}

export interface ShortcutSettings {
  overlayToggle: string;
  captureToggle: string;
  generateAnswer: string;
  typeLatestAnswer: string;
}

export interface OverlayWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  monitorName?: string;
}

export interface AppProfile {
  id: string;
  name: string;
  interviewType: InterviewType;
  providerId: ProviderId;
  sttMode: SttMode;
  overlay: OverlaySettings;
  shortcuts: ShortcutSettings;
}
