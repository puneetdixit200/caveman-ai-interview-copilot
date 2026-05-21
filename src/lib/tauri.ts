import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AudioCaptureState, AudioChunkEvent, AudioLevelEvent } from "./audioEvents";
import type {
  AIResponseRecord,
  NewAIResponseInput,
  NewSessionInput,
  SessionRecord,
  SttTranscriptEvent,
  TranscriptCursor,
  TranscriptPage,
  TranscriptSegment
} from "../types/session";
import type { AudioDevice, OverlayWindowBounds } from "../types/settings";
import type { CollaborationHint, CollaborationServerStatus, CollaborationSnapshot } from "../types/collaboration";
import type { PluginManifestFile } from "./pluginLoader";

export interface OverlayProtectionStatus {
  alwaysOnTop: boolean;
  skipTaskbar: boolean;
  captureExclusion: "enabled" | "failed" | "unsupported" | string;
  clickThrough: boolean;
  visible: boolean;
  message?: string | null;
}

export interface SecretStatus {
  providerId: string;
  stored: boolean;
}

export interface CaptureSnapshot {
  source: "microphone" | "system" | string;
  audioPath: string;
  sampleRateHz: number;
  channels: number;
  durationMs: number;
  sampleCount: number;
}

export interface LocalWhisperSetupStatus {
  binaryPath?: string | null;
  modelPath?: string | null;
  modelsDir: string;
  ready: boolean;
  messages: string[];
}

export interface WhisperModelDownloadResult {
  model: string;
  modelPath: string;
  bytes: number;
  sha1: string;
  sourceUrl: string;
}

export interface TypingResult {
  characterCount: number;
  inputEventCount: number;
}

export interface NativeScreenFrame {
  imageDataUrl: string;
  width: number;
  height: number;
  monitorName?: string | null;
  capturedAtMs: number;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isRunningInTauri(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export async function invokeOrFallback<T>(
  command: string,
  args: Record<string, unknown>,
  fallback: () => T | Promise<T>
): Promise<T> {
  if (!isRunningInTauri()) {
    return fallback();
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.error(`Tauri command failed: ${command}`, error);
    return fallback();
  }
}

async function invokeStrictOrFallback<T>(
  command: string,
  args: Record<string, unknown>,
  fallback: () => T | Promise<T>
): Promise<T> {
  if (!isRunningInTauri()) {
    return fallback();
  }

  return invoke<T>(command, args);
}

export async function getSetting(key: string): Promise<string | undefined> {
  return invokeOrFallback<string | null>("get_setting", { key }, () => localStorage.getItem(key)).then(
    (value) => value ?? undefined
  );
}

export async function saveSetting(key: string, value: string): Promise<void> {
  return invokeOrFallback<void>("save_setting", { key, value }, () => {
    localStorage.setItem(key, value);
  });
}

function providerSecretStorageKey(providerId: string): string {
  return `caveman.provider-secret.${providerId}`;
}

export async function saveProviderApiKey(providerId: string, secret: string): Promise<SecretStatus> {
  return invokeStrictOrFallback<SecretStatus>("save_provider_api_key", { providerId, secret }, () => {
    sessionStorage.setItem(providerSecretStorageKey(providerId), secret.trim());
    return { providerId, stored: true };
  });
}

export async function getProviderApiKey(providerId: string): Promise<string | undefined> {
  return invokeStrictOrFallback<string | null>("get_provider_api_key", { providerId }, () =>
    sessionStorage.getItem(providerSecretStorageKey(providerId))
  ).then((value) => value ?? undefined);
}

export async function deleteProviderApiKey(providerId: string): Promise<SecretStatus> {
  return invokeStrictOrFallback<SecretStatus>("delete_provider_api_key", { providerId }, () => {
    sessionStorage.removeItem(providerSecretStorageKey(providerId));
    return { providerId, stored: false };
  });
}

export async function listSessions(): Promise<SessionRecord[]> {
  return invokeOrFallback<SessionRecord[]>("list_sessions", {}, () => []);
}

export async function createSession(input: NewSessionInput): Promise<SessionRecord> {
  return invokeOrFallback<SessionRecord>("create_session", { input }, () => ({
    id: crypto.randomUUID(),
    title: input.title,
    company: input.company,
    role: input.role,
    interviewType: input.interviewType,
    tags: input.tags,
    status: "active",
    totalTokens: 0,
    durationSeconds: 0,
    notes: input.notes,
    createdAt: new Date().toISOString()
  }));
}

export async function addTranscript(input: {
  sessionId: string;
  speaker: TranscriptSegment["speaker"];
  content: string;
  timestampMs: number;
  confidence?: number;
}): Promise<TranscriptSegment> {
  return invokeOrFallback<TranscriptSegment>(
    "add_transcript",
    {
      sessionId: input.sessionId,
      speaker: input.speaker,
      content: input.content,
      timestampMs: input.timestampMs,
      confidence: input.confidence
    },
    () => ({
      id: Date.now(),
      sessionId: input.sessionId,
      speaker: input.speaker,
      content: input.content,
      timestampMs: input.timestampMs,
      confidence: input.confidence,
      createdAt: new Date().toISOString()
    })
  );
}

export async function listTranscripts(sessionId: string): Promise<TranscriptSegment[]> {
  return invokeOrFallback<TranscriptSegment[]>("list_transcripts", { sessionId }, () => []);
}

export async function listTranscriptPage(
  sessionId: string,
  options: {
    limit?: number;
    cursor?: TranscriptCursor;
    direction?: "before" | "after";
  } = {}
): Promise<TranscriptPage> {
  return invokeOrFallback<TranscriptPage>(
    "list_transcripts_page",
    {
      sessionId,
      limit: options.limit,
      cursor: options.cursor,
      direction: options.direction
    },
    async () => {
      const allTranscripts = await listTranscripts(sessionId);
      const limit = Math.max(1, Math.min(500, options.limit ?? 100));
      const cursorIndex = options.cursor
        ? allTranscripts.findIndex(
            (segment) => segment.timestampMs === options.cursor?.timestampMs && segment.id === options.cursor?.id
          )
        : -1;
      const start =
        options.direction === "before"
          ? Math.max(0, (cursorIndex >= 0 ? cursorIndex : allTranscripts.length) - limit)
          : Math.max(0, cursorIndex + 1);
      const items = allTranscripts.slice(start, start + limit);

      return buildFallbackTranscriptPage(items, allTranscripts.length, start, limit);
    }
  );
}

export async function updateTranscript(input: {
  id: number;
  speaker: TranscriptSegment["speaker"];
  content: string;
  timestampMs: number;
  confidence?: number;
}): Promise<TranscriptSegment> {
  return invokeOrFallback<TranscriptSegment>(
    "update_transcript",
    {
      id: input.id,
      speaker: input.speaker,
      content: input.content,
      timestampMs: input.timestampMs,
      confidence: input.confidence
    },
    () => ({
      id: input.id,
      sessionId: "",
      speaker: input.speaker,
      content: input.content,
      timestampMs: input.timestampMs,
      confidence: input.confidence,
      createdAt: new Date().toISOString()
    })
  );
}

export async function deleteTranscript(id: number): Promise<void> {
  return invokeOrFallback<void>("delete_transcript", { id }, () => undefined);
}

function buildFallbackTranscriptPage(
  items: TranscriptSegment[],
  totalCount: number,
  start: number,
  limit: number
): TranscriptPage {
  return {
    items,
    totalCount,
    hasMoreBefore: start > 0,
    hasMoreAfter: start + limit < totalCount,
    previousCursor: transcriptCursorFor(items[0]),
    nextCursor: transcriptCursorFor(items[items.length - 1])
  };
}

function transcriptCursorFor(segment: TranscriptSegment | undefined): TranscriptCursor | undefined {
  return segment ? { timestampMs: segment.timestampMs, id: segment.id } : undefined;
}

export async function addAiResponse(input: NewAIResponseInput): Promise<AIResponseRecord> {
  return invokeOrFallback<AIResponseRecord>("add_ai_response", { input }, () => ({
    id: Date.now(),
    sessionId: input.sessionId,
    triggerTranscriptId: input.triggerTranscriptId,
    promptMessages: input.promptMessages,
    response: input.response,
    model: input.model,
    provider: input.provider,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    latencyMs: input.latencyMs,
    createdAt: new Date().toISOString()
  }));
}

export async function listAiResponses(sessionId: string): Promise<AIResponseRecord[]> {
  return invokeOrFallback<AIResponseRecord[]>("list_ai_responses", { sessionId }, () => []);
}

export async function listAudioDevices(): Promise<AudioDevice[]> {
  return invokeOrFallback<AudioDevice[]>("list_audio_devices", {}, () => []);
}

export async function startCapture(input: {
  systemDeviceId: string;
  microphoneDeviceId: string;
  gainDb: number;
  noiseGateDb: number;
}): Promise<AudioCaptureState> {
  return invokeStrictOrFallback<AudioCaptureState>(
    "start_capture",
    {
      systemDeviceId: input.systemDeviceId,
      microphoneDeviceId: input.microphoneDeviceId,
      gainDb: input.gainDb,
      noiseGateDb: input.noiseGateDb
    },
    () => ({
      running: true,
      systemDeviceId: input.systemDeviceId,
      microphoneDeviceId: input.microphoneDeviceId,
      sampleRateHz: 16000,
      channels: 1,
      microphoneLevel: 0,
      systemLevel: 0,
      gainDb: input.gainDb,
      noiseGateDb: input.noiseGateDb,
      systemCaptureSupported: false
    })
  );
}

export async function stopCapture(): Promise<AudioCaptureState> {
  return invokeOrFallback<AudioCaptureState>("stop_capture", {}, () => ({
    running: false,
    systemDeviceId: "default",
    microphoneDeviceId: "default",
    sampleRateHz: 16000,
    channels: 1,
    microphoneLevel: 0,
    systemLevel: 0,
    gainDb: 0,
    noiseGateDb: -80,
    systemCaptureSupported: false
  }));
}

export async function getCaptureStatus(): Promise<AudioCaptureState> {
  return invokeOrFallback<AudioCaptureState>("get_capture_status", {}, () => ({
    running: false,
    systemDeviceId: "default",
    microphoneDeviceId: "default",
    sampleRateHz: 16000,
    channels: 1,
    microphoneLevel: 0,
    systemLevel: 0,
    gainDb: 0,
    noiseGateDb: -80,
    systemCaptureSupported: false
  }));
}

export async function saveCaptureSnapshot(input: {
  source: "microphone" | "system";
  maxSeconds: number;
}): Promise<CaptureSnapshot> {
  return invokeStrictOrFallback<CaptureSnapshot>(
    "save_capture_snapshot",
    {
      source: input.source,
      maxSeconds: input.maxSeconds
    },
    () => ({
      source: input.source,
      audioPath: "",
      sampleRateHz: 16000,
      channels: 1,
      durationMs: 0,
      sampleCount: 0
    })
  );
}

export async function onAudioLevel(callback: (event: AudioLevelEvent) => void): Promise<() => void> {
  if (!isRunningInTauri()) {
    return () => undefined;
  }

  return listen<AudioLevelEvent>("audio-level", (event) => callback(event.payload));
}

export async function onAudioChunk(callback: (event: AudioChunkEvent) => void): Promise<() => void> {
  if (!isRunningInTauri()) {
    return () => undefined;
  }

  return listen<AudioChunkEvent>("audio-chunk", (event) => callback(event.payload));
}

export async function detectLocalWhisperSetup(searchRoots?: string[]): Promise<LocalWhisperSetupStatus> {
  return invokeStrictOrFallback<LocalWhisperSetupStatus>(
    "detect_local_whisper_setup",
    { searchRoots },
    () => ({
      binaryPath: undefined,
      modelPath: undefined,
      modelsDir: "",
      ready: false,
      messages: ["Native Whisper setup detection is available only inside the Caveman desktop app."]
    })
  );
}

export async function downloadWhisperModel(input: {
  model: string;
  modelsDir?: string;
  sourceUrl?: string;
}): Promise<WhisperModelDownloadResult> {
  return invokeStrictOrFallback<WhisperModelDownloadResult>("download_whisper_model", input, async () => {
    throw new Error("Native Whisper model download is available only inside the Caveman desktop app.");
  });
}

export async function transcribeWithLocalWhisper(input: {
  binaryPath: string;
  modelPath: string;
  audioPath: string;
  language?: string;
  diarizationEnabled?: boolean;
}): Promise<SttTranscriptEvent[]> {
  return invokeStrictOrFallback<SttTranscriptEvent[]>("transcribe_with_local_whisper", { input }, () => []);
}

export async function transcribeLocalWhisperPcm(input: {
  binaryPath: string;
  modelPath: string;
  pcm16Base64: string;
  sampleRateHz: number;
  channels: number;
  language?: string;
  diarizationEnabled?: boolean;
}): Promise<SttTranscriptEvent[]> {
  return invokeStrictOrFallback<SttTranscriptEvent[]>("transcribe_local_whisper_pcm", { input }, () => []);
}

export async function transcribeWithCloudStt(input: {
  provider: "deepgram" | "assemblyai" | "google";
  apiKey: string;
  audioPath: string;
  language?: string;
  diarizationEnabled?: boolean;
  endpoint?: string;
}): Promise<SttTranscriptEvent[]> {
  return invokeStrictOrFallback<SttTranscriptEvent[]>("transcribe_with_cloud_stt", { input }, () => []);
}

export async function protectOverlayWindow(): Promise<OverlayProtectionStatus> {
  return invokeOrFallback<OverlayProtectionStatus>("protect_overlay_window", {}, () => ({
    alwaysOnTop: false,
    skipTaskbar: false,
    captureExclusion: "unsupported",
    clickThrough: false,
    visible: false,
    message: "Native overlay protection is available only inside the Tauri desktop app."
  }));
}

export async function setOverlayWindowVisible(visible: boolean): Promise<OverlayProtectionStatus> {
  return invokeOrFallback<OverlayProtectionStatus>("set_overlay_window_visible", { visible }, () => ({
    alwaysOnTop: false,
    skipTaskbar: false,
    captureExclusion: "unsupported",
    clickThrough: false,
    visible,
    message: "Native overlay visibility is available only inside the Tauri desktop app."
  }));
}

export async function getOverlayWindowBounds(): Promise<OverlayWindowBounds> {
  return invokeOrFallback<OverlayWindowBounds>("get_overlay_window_bounds", {}, () => ({
    x: 80,
    y: 80,
    width: 680,
    height: 420
  }));
}

export async function setOverlayWindowBounds(bounds: OverlayWindowBounds): Promise<OverlayWindowBounds> {
  return invokeOrFallback<OverlayWindowBounds>("set_overlay_window_bounds", { bounds }, () => bounds);
}

export async function loadPluginManifests(directory: string): Promise<PluginManifestFile[]> {
  return invokeStrictOrFallback<PluginManifestFile[]>("load_plugin_manifests", { directory }, () => []);
}

export async function captureNativeScreenFrame(): Promise<NativeScreenFrame> {
  return invokeStrictOrFallback<NativeScreenFrame>("capture_screen_frame", {}, async () => {
    throw new Error("Native screen capture is available only inside the Caveman desktop app.");
  });
}

export async function typeTextIntoActiveWindow(text: string): Promise<TypingResult> {
  return invokeStrictOrFallback<TypingResult>("type_text_into_active_window", { text }, () => ({
    characterCount: Array.from(text).length,
    inputEventCount: text.length * 2
  }));
}

export async function startCollaborationServer(
  input: { bindHost?: string; port?: number; token?: string } = {}
): Promise<CollaborationServerStatus> {
  return invokeStrictOrFallback<CollaborationServerStatus>(
    "start_collaboration_server",
    {
      bindHost: input.bindHost,
      port: input.port,
      token: input.token
    },
    () => ({
      running: false,
      hintCount: 0,
      message: "Collaboration helper links are available only inside the Caveman desktop app."
    })
  );
}

export async function stopCollaborationServer(): Promise<CollaborationServerStatus> {
  return invokeOrFallback<CollaborationServerStatus>("stop_collaboration_server", {}, () => ({
    running: false,
    hintCount: 0,
    message: "Collaboration helper stopped"
  }));
}

export async function getCollaborationStatus(): Promise<CollaborationServerStatus> {
  return invokeOrFallback<CollaborationServerStatus>("get_collaboration_status", {}, () => ({
    running: false,
    hintCount: 0
  }));
}

export async function publishCollaborationSnapshot(snapshot: CollaborationSnapshot): Promise<void> {
  return invokeOrFallback<void>("publish_collaboration_snapshot", { snapshot }, () => undefined);
}

export async function listCollaborationHints(): Promise<CollaborationHint[]> {
  return invokeOrFallback<CollaborationHint[]>("list_collaboration_hints", {}, () => []);
}

export async function clearCollaborationHint(id: string): Promise<void> {
  return invokeOrFallback<void>("clear_collaboration_hint", { id }, () => undefined);
}
