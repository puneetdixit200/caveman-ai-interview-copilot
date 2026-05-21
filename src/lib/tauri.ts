import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AudioCaptureState, AudioChunkEvent, AudioLevelEvent } from "./audioEvents";
import {
  KNOWLEDGE_BASE_SETTING_KEY,
  chunkKnowledgeDocument,
  clearKnowledgeBase,
  parseKnowledgeBase,
  removeKnowledgeDocument,
  serializeKnowledgeBase,
  upsertKnowledgeDocument,
  type KnowledgeBase,
  type KnowledgeDocumentInput
} from "./knowledge";
import type {
  AIResponseRecord,
  NewAIResponseInput,
  NewPracticeScoreInput,
  NewSessionInput,
  PracticeScoreRecord,
  SessionRecord,
  SttTranscriptEvent,
  TranscriptCursor,
  TranscriptPage,
  TranscriptSegment,
  UpdateSessionInput
} from "../types/session";
import type { AudioApplication, AudioCaptureMode, AudioDevice, OverlayWindowBounds } from "../types/settings";
import type { CollaborationHint, CollaborationServerStatus, CollaborationSnapshot } from "../types/collaboration";
import type { PluginManifestFile } from "./pluginLoader";
import type { RuntimeBudgetStatus } from "./readiness";

export type { RuntimeBudgetStatus } from "./readiness";

export interface OverlayProtectionStatus {
  alwaysOnTop: boolean;
  skipTaskbar: boolean;
  captureExclusion: "enabled" | "failed" | "unsupported" | string;
  clickThrough: boolean;
  visible: boolean;
  message?: string | null;
}

export interface ScreenShareProcess {
  name: string;
  pid?: number | null;
}

export interface ScreenShareStatus {
  active: boolean;
  matchedProcesses: ScreenShareProcess[];
  message?: string | null;
}

export interface SecretStatus {
  providerId: string;
  stored: boolean;
}

export interface SecurityEvent {
  id: number;
  category: string;
  action: string;
  target?: string | null;
  details?: string | null;
  createdAt: string;
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

export interface ActiveWindowInfo {
  title: string;
  processName: string;
  executablePath?: string | null;
  editorKind?: string | null;
  isCodeEditor: boolean;
}

export interface NativeScreenFrame {
  imageDataUrl: string;
  width: number;
  height: number;
  monitorName?: string | null;
  capturedAtMs: number;
}

const browserStartupOriginMs = typeof performance !== "undefined" ? performance.now() : 0;

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

export async function listKnowledgeBase(): Promise<KnowledgeBase> {
  return invokeOrFallback<KnowledgeBase>("list_knowledge_base", {}, () =>
    parseKnowledgeBase(localStorage.getItem(KNOWLEDGE_BASE_SETTING_KEY))
  );
}

export async function saveKnowledgeDocumentNative(input: KnowledgeDocumentInput): Promise<KnowledgeBase> {
  const normalized = normalizeKnowledgeDocumentInput(input);
  return invokeOrFallback<KnowledgeBase>(
    "upsert_knowledge_document",
    {
      input: {
        ...normalized,
        chunks: chunkKnowledgeDocument(normalized)
      }
    },
    () => {
      const base = upsertKnowledgeDocument(parseKnowledgeBase(localStorage.getItem(KNOWLEDGE_BASE_SETTING_KEY)), normalized);
      localStorage.setItem(KNOWLEDGE_BASE_SETTING_KEY, serializeKnowledgeBase(base));
      return base;
    }
  );
}

export async function deleteKnowledgeDocumentNative(documentId: string): Promise<KnowledgeBase> {
  return invokeOrFallback<KnowledgeBase>("delete_knowledge_document", { documentId }, () => {
    const base = removeKnowledgeDocument(parseKnowledgeBase(localStorage.getItem(KNOWLEDGE_BASE_SETTING_KEY)), documentId);
    localStorage.setItem(KNOWLEDGE_BASE_SETTING_KEY, serializeKnowledgeBase(base));
    return base;
  });
}

export async function clearKnowledgeBaseNative(): Promise<KnowledgeBase> {
  return invokeOrFallback<KnowledgeBase>("clear_knowledge_base", {}, () => {
    const base = clearKnowledgeBase();
    localStorage.setItem(KNOWLEDGE_BASE_SETTING_KEY, serializeKnowledgeBase(base));
    return base;
  });
}

function normalizeKnowledgeDocumentInput(input: KnowledgeDocumentInput): KnowledgeDocumentInput {
  return {
    ...input,
    id: input.id.trim(),
    title: input.title.trim(),
    sourceType: input.sourceType.trim() || "note",
    text: input.text.trim()
  };
}

function providerSecretStorageKey(providerId: string): string {
  return `caveman.provider-secret.${providerId}`;
}

const SECURITY_EVENTS_FALLBACK_KEY = "caveman.security-events";
const PRACTICE_SCORES_FALLBACK_KEY = "caveman.practice-scores";

export async function saveProviderApiKey(providerId: string, secret: string): Promise<SecretStatus> {
  return invokeStrictOrFallback<SecretStatus>("save_provider_api_key", { providerId, secret }, () => {
    sessionStorage.setItem(providerSecretStorageKey(providerId), secret.trim());
    recordFallbackSecurityEvent({
      category: "secret",
      action: "provider_key_saved",
      target: providerId,
      details: "Stored provider key in session fallback storage"
    });
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
    recordFallbackSecurityEvent({
      category: "secret",
      action: "provider_key_deleted",
      target: providerId,
      details: "Removed provider key from session fallback storage"
    });
    return { providerId, stored: false };
  });
}

export async function listSecurityEvents(limit = 25): Promise<SecurityEvent[]> {
  return invokeOrFallback<SecurityEvent[]>("list_security_events", { limit }, () =>
    readFallbackSecurityEvents().slice(0, clampSecurityEventLimit(limit))
  );
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

export async function updateSession(input: UpdateSessionInput): Promise<SessionRecord> {
  const normalized = normalizeUpdateSessionInput(input);

  return invokeOrFallback<SessionRecord>("update_session", { input: normalized }, () => ({
    id: normalized.id,
    title: normalized.title,
    company: normalized.company,
    role: normalized.role,
    interviewType: normalized.interviewType,
    tags: normalized.tags,
    status: normalized.status,
    totalTokens: 0,
    durationSeconds: 0,
    notes: normalized.notes,
    createdAt: new Date().toISOString(),
    endedAt: normalized.status === "active" ? undefined : new Date().toISOString()
  }));
}

function normalizeUpdateSessionInput(input: UpdateSessionInput): UpdateSessionInput {
  return {
    ...input,
    title: input.title.trim(),
    company: normalizeOptionalText(input.company),
    role: normalizeOptionalText(input.role),
    notes: normalizeOptionalText(input.notes),
    tags: normalizeTags(input.tags)
  };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTags(tags: string[]): string[] {
  return tags.map((tag) => tag.trim()).filter((tag, index, all) => tag && all.indexOf(tag) === index);
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

export async function addPracticeScore(input: NewPracticeScoreInput): Promise<PracticeScoreRecord> {
  const normalized = normalizePracticeScoreInput(input);

  return invokeOrFallback<PracticeScoreRecord>("add_practice_score", { input: normalized }, () => {
    const scores = readFallbackPracticeScores();
    const next: PracticeScoreRecord = {
      ...normalized,
      id: Date.now() + scores.length,
      createdAt: new Date().toISOString()
    };
    localStorage.setItem(PRACTICE_SCORES_FALLBACK_KEY, JSON.stringify([...scores, next]));
    return next;
  });
}

export async function listPracticeScores(sessionId: string): Promise<PracticeScoreRecord[]> {
  return invokeOrFallback<PracticeScoreRecord[]>("list_practice_scores", { sessionId }, () =>
    readFallbackPracticeScores()
      .filter((score) => score.sessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id - right.id)
  );
}

function normalizePracticeScoreInput(input: NewPracticeScoreInput): NewPracticeScoreInput {
  return {
    ...input,
    sessionId: input.sessionId.trim(),
    questionId: input.questionId.trim(),
    question: input.question.trim(),
    answer: input.answer.trim(),
    score: Math.min(5, Math.max(1, Math.round(input.score))),
    feedback: input.feedback.trim(),
    nextAction: input.nextAction.trim(),
    matchedSignals: input.matchedSignals.map((signal) => signal.trim()).filter(Boolean)
  };
}

export async function listAudioDevices(): Promise<AudioDevice[]> {
  return invokeOrFallback<AudioDevice[]>("list_audio_devices", {}, () => []);
}

export async function listAudioApplications(): Promise<AudioApplication[]> {
  return invokeOrFallback<AudioApplication[]>("list_audio_applications", {}, () => []);
}

export async function startCapture(input: {
  captureMode: AudioCaptureMode;
  dualStreamEnabled: boolean;
  systemDeviceId: string;
  microphoneDeviceId: string;
  applicationTargetId: string;
  applicationTargetLabel: string;
  gainDb: number;
  noiseGateDb: number;
}): Promise<AudioCaptureState> {
  return invokeStrictOrFallback<AudioCaptureState>(
    "start_capture",
    {
      captureMode: input.captureMode,
      dualStreamEnabled: input.dualStreamEnabled,
      systemDeviceId: input.systemDeviceId,
      microphoneDeviceId: input.microphoneDeviceId,
      applicationTargetId: input.applicationTargetId,
      applicationTargetLabel: input.applicationTargetLabel,
      gainDb: input.gainDb,
      noiseGateDb: input.noiseGateDb
    },
    () => {
      recordFallbackSecurityEvent({
        category: "audio",
        action: "audio_capture_started",
        target: input.captureMode,
        details: "Native audio capture stream started"
      });
      return {
        running: true,
        systemDeviceId: shouldCaptureSystem(input.captureMode, input.dualStreamEnabled) ? input.systemDeviceId : "",
        microphoneDeviceId: shouldCaptureMicrophone(input.captureMode, input.dualStreamEnabled)
          ? input.microphoneDeviceId
          : "",
        applicationTargetId: shouldCaptureSystem(input.captureMode, input.dualStreamEnabled)
          ? input.applicationTargetId
          : "all-system-audio",
        applicationTargetLabel: shouldCaptureSystem(input.captureMode, input.dualStreamEnabled)
          ? input.applicationTargetLabel
          : "All system audio",
        sampleRateHz: 16000,
        channels: 1,
        microphoneLevel: 0,
        systemLevel: 0,
        gainDb: input.gainDb,
        noiseGateDb: input.noiseGateDb,
        systemCaptureSupported: shouldCaptureSystem(input.captureMode, input.dualStreamEnabled)
      };
    }
  );
}

function shouldCaptureMicrophone(captureMode: AudioCaptureMode, dualStreamEnabled: boolean): boolean {
  return captureMode === "microphone" || (captureMode === "dual" && dualStreamEnabled);
}

function shouldCaptureSystem(captureMode: AudioCaptureMode, dualStreamEnabled: boolean): boolean {
  return captureMode === "system" || (captureMode === "dual" && dualStreamEnabled);
}

export async function stopCapture(): Promise<AudioCaptureState> {
  return invokeOrFallback<AudioCaptureState>("stop_capture", {}, () => {
    recordFallbackSecurityEvent({
      category: "audio",
      action: "audio_capture_stopped",
      details: "Native audio capture stream stopped"
    });
    return {
      running: false,
      systemDeviceId: "default",
      microphoneDeviceId: "default",
      applicationTargetId: "all-system-audio",
      applicationTargetLabel: "All system audio",
      sampleRateHz: 16000,
      channels: 1,
      microphoneLevel: 0,
      systemLevel: 0,
      gainDb: 0,
      noiseGateDb: -80,
      systemCaptureSupported: false
    };
  });
}

export async function getCaptureStatus(): Promise<AudioCaptureState> {
  return invokeOrFallback<AudioCaptureState>("get_capture_status", {}, () => ({
    running: false,
    systemDeviceId: "default",
    microphoneDeviceId: "default",
    applicationTargetId: "all-system-audio",
    applicationTargetLabel: "All system audio",
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

export async function deleteCaptureSnapshot(audioPath: string): Promise<boolean> {
  return invokeStrictOrFallback<boolean>("delete_capture_snapshot", { audioPath }, () => false);
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
  localOnlyMode?: boolean;
  blockCloudWhenLocalOnly?: boolean;
}): Promise<SttTranscriptEvent[]> {
  return invokeStrictOrFallback<SttTranscriptEvent[]>("transcribe_with_cloud_stt", { input }, () => []);
}

export async function getRuntimeBudgetStatus(): Promise<RuntimeBudgetStatus> {
  return invokeOrFallback<RuntimeBudgetStatus>("get_runtime_budget_status", {}, () => {
    const runtime = typeof performance !== "undefined" ? performance : undefined;
    const memory = runtime
      ? (runtime as Performance & { memory?: { usedJSHeapSize?: number } }).memory
      : undefined;
    const workingSetMb =
      typeof memory?.usedJSHeapSize === "number" ? Math.round((memory.usedJSHeapSize / 1024 / 1024) * 10) / 10 : null;

    return {
      startupMs: runtime ? Math.max(0, Math.round(runtime.now() - browserStartupOriginMs)) : 0,
      workingSetMb,
      processCpuPercent: null,
      startupTargetMs: 3000,
      memoryTargetMb: 500,
      idleCpuTargetPercent: 15,
      activeCpuTargetPercent: 40,
      sampleCount: 1,
      source: "browser-fallback",
      message: "Native process metrics are available only inside the Caveman desktop app."
    };
  });
}

export async function protectOverlayWindow(captureExclusionEnabled = true): Promise<OverlayProtectionStatus> {
  return invokeOrFallback<OverlayProtectionStatus>("protect_overlay_window", { captureExclusionEnabled }, () => ({
    alwaysOnTop: false,
    skipTaskbar: false,
    captureExclusion: captureExclusionEnabled ? "unsupported" : "disabled",
    clickThrough: false,
    visible: false,
    message: captureExclusionEnabled
      ? "Native overlay protection is available only inside the Tauri desktop app."
      : "Capture exclusion is disabled in Security settings."
  }));
}

export async function setOverlayWindowVisible(
  visible: boolean,
  captureExclusionEnabled = true
): Promise<OverlayProtectionStatus> {
  return invokeOrFallback<OverlayProtectionStatus>(
    "set_overlay_window_visible",
    { visible, captureExclusionEnabled },
    () => ({
      alwaysOnTop: false,
      skipTaskbar: false,
      captureExclusion: captureExclusionEnabled ? "unsupported" : "disabled",
      clickThrough: false,
      visible,
      message: captureExclusionEnabled
        ? "Native overlay visibility is available only inside the Tauri desktop app."
        : "Capture exclusion is disabled in Security settings."
    })
  );
}

export async function getOverlayWindowBounds(): Promise<OverlayWindowBounds> {
  return invokeOrFallback<OverlayWindowBounds>("get_overlay_window_bounds", {}, () => ({
    x: 80,
    y: 80,
    width: 680,
    height: 420
  }));
}

export async function setOverlayWindowBounds(
  bounds: OverlayWindowBounds,
  captureExclusionEnabled = true
): Promise<OverlayWindowBounds> {
  return invokeOrFallback<OverlayWindowBounds>(
    "set_overlay_window_bounds",
    { bounds, captureExclusionEnabled },
    () => bounds
  );
}

export async function detectScreenShareStatus(): Promise<ScreenShareStatus> {
  return invokeOrFallback<ScreenShareStatus>("detect_screen_share_status", {}, () => ({
    active: false,
    matchedProcesses: [],
    message: "Native screen-share process detection is available only inside the Caveman desktop app."
  }));
}

export async function loadPluginManifests(directory: string): Promise<PluginManifestFile[]> {
  return invokeStrictOrFallback<PluginManifestFile[]>("load_plugin_manifests", { directory }, () => []);
}

export async function captureNativeScreenFrame(): Promise<NativeScreenFrame> {
  return invokeStrictOrFallback<NativeScreenFrame>("capture_screen_frame", {}, async () => {
    throw new Error("Native screen capture is available only inside the Caveman desktop app.");
  });
}

export async function getActiveWindowInfo(): Promise<ActiveWindowInfo> {
  return invokeStrictOrFallback<ActiveWindowInfo>("get_active_window_info", {}, () => ({
    title: "Browser fallback",
    processName: "browser",
    executablePath: null,
    editorKind: "Browser fallback",
    isCodeEditor: true
  }));
}

export async function typeTextIntoActiveWindow(text: string): Promise<TypingResult> {
  return invokeStrictOrFallback<TypingResult>("type_text_into_active_window", { text }, () => {
    const result = {
      characterCount: Array.from(text).length,
      inputEventCount: text.length * 2
    };
    recordFallbackSecurityEvent({
      category: "automation",
      action: "active_window_typing",
      details: `Typed ${result.characterCount} characters into active window`
    });
    return result;
  });
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
    () => {
      recordFallbackSecurityEvent({
        category: "collaboration",
        action: "collaboration_start_attempted",
        details: "Collaboration helper link requested outside the desktop app"
      });
      return {
        running: false,
        hintCount: 0,
        message: "Collaboration helper links are available only inside the Caveman desktop app."
      };
    }
  );
}

export async function stopCollaborationServer(): Promise<CollaborationServerStatus> {
  return invokeOrFallback<CollaborationServerStatus>("stop_collaboration_server", {}, () => {
    recordFallbackSecurityEvent({
      category: "collaboration",
      action: "collaboration_stopped",
      details: "Trusted helper link stopped"
    });
    return {
      running: false,
      hintCount: 0,
      message: "Collaboration helper stopped"
    };
  });
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

function recordFallbackSecurityEvent(input: {
  category: string;
  action: string;
  target?: string;
  details?: string;
}) {
  const events = readFallbackSecurityEvents();
  const nextEvent: SecurityEvent = {
    id: Date.now(),
    category: input.category,
    action: input.action,
    target: input.target,
    details: input.details,
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(SECURITY_EVENTS_FALLBACK_KEY, JSON.stringify([nextEvent, ...events].slice(0, 200)));
}

function readFallbackSecurityEvents(): SecurityEvent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SECURITY_EVENTS_FALLBACK_KEY) ?? "[]") as SecurityEvent[];
    return Array.isArray(parsed) ? parsed.filter(isSecurityEvent) : [];
  } catch {
    return [];
  }
}

function isSecurityEvent(value: unknown): value is SecurityEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SecurityEvent).id === "number" &&
    typeof (value as SecurityEvent).category === "string" &&
    typeof (value as SecurityEvent).action === "string" &&
    typeof (value as SecurityEvent).createdAt === "string"
  );
}

function readFallbackPracticeScores(): PracticeScoreRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRACTICE_SCORES_FALLBACK_KEY) ?? "[]") as PracticeScoreRecord[];
    return Array.isArray(parsed) ? parsed.filter(isPracticeScoreRecord) : [];
  } catch {
    return [];
  }
}

function isPracticeScoreRecord(value: unknown): value is PracticeScoreRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PracticeScoreRecord).id === "number" &&
    typeof (value as PracticeScoreRecord).sessionId === "string" &&
    typeof (value as PracticeScoreRecord).questionId === "string" &&
    typeof (value as PracticeScoreRecord).question === "string" &&
    typeof (value as PracticeScoreRecord).answer === "string" &&
    typeof (value as PracticeScoreRecord).score === "number" &&
    typeof (value as PracticeScoreRecord).feedback === "string" &&
    typeof (value as PracticeScoreRecord).nextAction === "string" &&
    Array.isArray((value as PracticeScoreRecord).matchedSignals) &&
    typeof (value as PracticeScoreRecord).createdAt === "string"
  );
}

function clampSecurityEventLimit(limit: number): number {
  return Math.max(1, Math.min(200, Math.trunc(limit)));
}
