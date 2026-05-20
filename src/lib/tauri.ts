import { invoke } from "@tauri-apps/api/core";
import type {
  AIResponseRecord,
  NewAIResponseInput,
  NewSessionInput,
  SessionRecord,
  TranscriptSegment
} from "../types/session";
import type { AudioDevice } from "../types/settings";

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
