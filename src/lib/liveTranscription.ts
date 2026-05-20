import type { AppConfig } from "./appConfig";
import {
  addTranscript,
  saveCaptureSnapshot,
  transcribeWithCloudStt,
  transcribeWithLocalWhisper,
  type CaptureSnapshot
} from "./tauri";
import type { SttTranscriptEvent, TranscriptSegment } from "../types/session";
import type { AudioCaptureMode, SttMode } from "../types/settings";

type SttCloudMode = "deepgram" | "assemblyai" | "google";
type SnapshotSource = "microphone" | "system";

export interface LiveTranscriptionDeps {
  saveCaptureSnapshot: typeof saveCaptureSnapshot;
  transcribeWithLocalWhisper: typeof transcribeWithLocalWhisper;
  transcribeWithCloudStt: typeof transcribeWithCloudStt;
  addTranscript: typeof addTranscript;
}

export async function runLiveTranscriptionPass(input: {
  sessionId: string;
  config: AppConfig;
  seenTranscriptKeys: Set<string>;
  maxSeconds?: number;
  deps?: Partial<LiveTranscriptionDeps>;
  saveCaptureSnapshot?: LiveTranscriptionDeps["saveCaptureSnapshot"];
  transcribeWithLocalWhisper?: LiveTranscriptionDeps["transcribeWithLocalWhisper"];
  transcribeWithCloudStt?: LiveTranscriptionDeps["transcribeWithCloudStt"];
  addTranscript?: LiveTranscriptionDeps["addTranscript"];
}): Promise<TranscriptSegment[]> {
  const sttMode = input.config.stt.selectedMode;
  if (sttMode === "manual") {
    return [];
  }

  const deps = {
    saveCaptureSnapshot: input.saveCaptureSnapshot ?? input.deps?.saveCaptureSnapshot ?? saveCaptureSnapshot,
    transcribeWithLocalWhisper:
      input.transcribeWithLocalWhisper ?? input.deps?.transcribeWithLocalWhisper ?? transcribeWithLocalWhisper,
    transcribeWithCloudStt: input.transcribeWithCloudStt ?? input.deps?.transcribeWithCloudStt ?? transcribeWithCloudStt,
    addTranscript: input.addTranscript ?? input.deps?.addTranscript ?? addTranscript
  };
  const saved: TranscriptSegment[] = [];

  for (const source of selectSnapshotSources(input.config.audio.captureMode)) {
    const snapshot = await snapshotCapturedAudio(deps.saveCaptureSnapshot, source, input.maxSeconds ?? 6);
    if (!snapshot || !snapshot.audioPath || snapshot.sampleCount === 0 || snapshot.durationMs < 250) {
      continue;
    }

    const events = await transcribeSnapshot({ config: input.config, snapshot, sttMode, deps });

    for (const event of events) {
      const text = event.text.trim();
      if (!text) {
        continue;
      }

      const speaker = normalizeSpeakerForSource(event.speaker, snapshot.source);
      const key = transcriptKey(speaker, text);
      if (input.seenTranscriptKeys.has(key)) {
        continue;
      }

      input.seenTranscriptKeys.add(key);
      saved.push(
        await deps.addTranscript({
          sessionId: input.sessionId,
          speaker,
          content: text,
          timestampMs: Math.max(0, Math.round(event.startMs)),
          confidence: event.confidence
        })
      );
    }
  }

  return saved;
}

function selectSnapshotSources(captureMode: AudioCaptureMode): SnapshotSource[] {
  if (captureMode === "dual") {
    return ["system", "microphone"];
  }

  return captureMode === "system" ? ["system"] : ["microphone"];
}

async function snapshotCapturedAudio(
  saveSnapshot: LiveTranscriptionDeps["saveCaptureSnapshot"],
  source: SnapshotSource,
  maxSeconds: number
): Promise<CaptureSnapshot | null> {
  try {
    return await saveSnapshot({ source, maxSeconds });
  } catch (error) {
    if (isMissingCaptureError(error)) {
      return null;
    }

    throw error;
  }
}

function isMissingCaptureError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /^No (microphone|system) audio has been captured yet$/i.test(message.trim());
}

async function transcribeSnapshot(input: {
  config: AppConfig;
  snapshot: CaptureSnapshot;
  sttMode: SttMode;
  deps: LiveTranscriptionDeps;
}): Promise<SttTranscriptEvent[]> {
  if (input.sttMode === "local_whisper") {
    return input.deps.transcribeWithLocalWhisper({
      binaryPath: input.config.stt.localWhisperBinaryPath,
      modelPath: input.config.stt.localWhisperModelPath,
      audioPath: input.snapshot.audioPath,
      language: input.config.stt.language || "auto",
      diarizationEnabled: input.config.stt.diarizationEnabled
    });
  }

  if (isCloudSttMode(input.sttMode)) {
    const apiKey = input.config.stt.apiKey?.trim();
    if (!apiKey) {
      return [];
    }

    return input.deps.transcribeWithCloudStt({
      provider: input.sttMode,
      apiKey,
      audioPath: input.snapshot.audioPath,
      language: input.config.stt.language || "en-US",
      diarizationEnabled: input.config.stt.diarizationEnabled,
      endpoint: input.config.stt.cloudEndpoint || undefined
    });
  }

  return [];
}

function isCloudSttMode(mode: SttMode): mode is SttCloudMode {
  return mode === "deepgram" || mode === "assemblyai" || mode === "google";
}

function normalizeSpeakerForSource(speaker: SttTranscriptEvent["speaker"], source: CaptureSnapshot["source"]) {
  if (speaker !== "unknown") {
    return speaker;
  }

  if (source === "system") {
    return "interviewer";
  }

  if (source === "microphone") {
    return "candidate";
  }

  return speaker;
}

function transcriptKey(speaker: string, text: string): string {
  return `${speaker}:${text.toLowerCase().replace(/\s+/g, " ")}`;
}
