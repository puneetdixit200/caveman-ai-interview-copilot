import type { InterviewType } from "./session";

export type ProviderKind = "local" | "cloud";
export type ProviderId = "ollama" | "lmstudio" | "openrouter" | "openai" | "anthropic" | "groq";
export type SttMode = "local_whisper" | "deepgram" | "assemblyai" | "google";

export interface ModelProviderConfig {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  endpoint: string;
  model: string;
  enabled: boolean;
  apiKeyStored: boolean;
}

export interface AudioDevice {
  id: string;
  label: string;
  kind: "system" | "microphone" | "virtual";
  selected: boolean;
  level: number;
}

export interface AudioSettings {
  systemDeviceId: string;
  microphoneDeviceId: string;
  noiseGateDb: number;
  gainDb: number;
  sttMode: SttMode;
}

export interface OverlaySettings {
  opacity: number;
  fontSize: number;
  locked: boolean;
  hotkey: string;
  autoHideOnScreenShare: boolean;
}

export interface AppProfile {
  id: string;
  name: string;
  interviewType: InterviewType;
  providerId: ProviderId;
  sttMode: SttMode;
  overlay: OverlaySettings;
}

