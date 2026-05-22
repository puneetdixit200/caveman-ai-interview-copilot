import type { AppConfig } from "./appConfig";
import type { AudioLevelEvent } from "./audioEvents";
import { createConfiguredProvider } from "./providerClients";
import { selectRunnableProviders } from "./providerSelection";
import {
  deleteCaptureSnapshot,
  onAudioLevel,
  saveCaptureSnapshot,
  startCapture,
  stopCapture,
  transcribeWithCloudStt,
  transcribeWithLocalWhisper,
  type CaptureSnapshot
} from "./tauri";
import type { SttTranscriptEvent } from "../types/session";
import type { SttMode } from "../types/settings";

export type LivePipelineSmokeStatus = "ready" | "warning" | "blocked";
export type LivePipelineSmokeItemId = "audio" | "stt" | "provider";

export interface LivePipelineSmokeItem {
  id: LivePipelineSmokeItemId;
  label: string;
  status: LivePipelineSmokeStatus;
  detail: string;
  latencyMs?: number;
  action?: string;
}

export interface LivePipelineSmokeResult {
  status: LivePipelineSmokeStatus;
  startedAt: string;
  durationMs: number;
  transcriptSegments: number;
  firstAiChunk?: string;
  items: LivePipelineSmokeItem[];
  message: string;
}

interface LivePipelineSmokeDeps {
  onAudioLevel: typeof onAudioLevel;
  startCapture: typeof startCapture;
  stopCapture: typeof stopCapture;
  saveCaptureSnapshot: typeof saveCaptureSnapshot;
  deleteCaptureSnapshot: typeof deleteCaptureSnapshot;
  transcribeWithLocalWhisper: typeof transcribeWithLocalWhisper;
  transcribeWithCloudStt: typeof transcribeWithCloudStt;
  createConfiguredProvider: typeof createConfiguredProvider;
  wait: (durationMs: number) => Promise<void>;
  now: () => number;
}

interface AudioSnapshotSmokeResult {
  item: LivePipelineSmokeItem;
  snapshot?: CaptureSnapshot;
  peak: number;
}

interface SttSmokeResult {
  item: LivePipelineSmokeItem;
  events: SttTranscriptEvent[];
}

interface ProviderSmokeResult {
  item: LivePipelineSmokeItem;
  firstChunk?: string;
}

export async function runLivePipelineSmokeCheck(input: {
  config: AppConfig;
  durationMs?: number;
  snapshotSeconds?: number;
  deps?: Partial<LivePipelineSmokeDeps>;
}): Promise<LivePipelineSmokeResult> {
  const durationMs = Math.max(500, input.durationMs ?? 3000);
  const snapshotSeconds = Math.max(1, input.snapshotSeconds ?? Math.ceil(durationMs / 1000) + 1);
  const startedAt = new Date().toISOString();
  const startedMs = depsWithDefaults(input.deps).now();
  const deps = depsWithDefaults(input.deps);
  const items: LivePipelineSmokeItem[] = [];
  let transcriptEvents: SttTranscriptEvent[] = [];
  let firstAiChunk: string | undefined;

  const audio = await captureLiveSnapshot({
    config: input.config,
    durationMs,
    snapshotSeconds,
    deps
  });
  items.push(audio.item);

  if (audio.snapshot?.audioPath) {
    try {
      const stt = await runSttSmoke({
        config: input.config,
        snapshot: audio.snapshot,
        deps
      });
      transcriptEvents = stt.events;
      items.push(stt.item);
    } finally {
      await deps.deleteCaptureSnapshot(audio.snapshot.audioPath).catch(() => false);
    }
  }

  if (!items.some((item) => item.status === "blocked")) {
    const provider = await runProviderSmoke({
      config: input.config,
      transcriptEvents,
      deps
    });
    firstAiChunk = provider.firstChunk;
    items.push(provider.item);
  }

  return buildResult({
    startedAt,
    durationMs: Math.max(0, Math.round(deps.now() - startedMs)),
    transcriptSegments: transcriptEvents.length,
    firstAiChunk,
    items
  });
}

async function captureLiveSnapshot(input: {
  config: AppConfig;
  durationMs: number;
  snapshotSeconds: number;
  deps: LivePipelineSmokeDeps;
}): Promise<AudioSnapshotSmokeResult> {
  const mode = input.config.audio.captureMode;
  if (mode === "manual") {
    return {
      item: {
        id: "audio",
        label: "Live audio snapshot",
        status: "blocked",
        detail: "Manual transcript mode cannot prove the live interview pipeline.",
        action: "Switch capture mode to Microphone, System, or Dual, then run this smoke check again."
      },
      peak: 0
    };
  }

  const source = snapshotSource(mode, input.config.audio.dualStreamEnabled);
  const levels = createLevelAccumulator();
  let cleanup: (() => void) | undefined;
  let captureStarted = false;
  let captureStopped = false;

  try {
    cleanup = await input.deps.onAudioLevel((event) => recordLevel(levels, event));
    const started = await input.deps.startCapture({
      captureMode: mode,
      dualStreamEnabled: input.config.audio.dualStreamEnabled,
      systemDeviceId: input.config.audio.systemDeviceId,
      microphoneDeviceId: input.config.audio.microphoneDeviceId,
      applicationTargetId: input.config.audio.applicationTargetId,
      applicationTargetLabel: input.config.audio.applicationTargetLabel,
      gainDb: input.config.audio.gainDb,
      noiseGateDb: input.config.audio.noiseGateDb
    });
    captureStarted = started.running;

    if (!started.running) {
      return {
        item: {
          id: "audio",
          label: "Live audio snapshot",
          status: "blocked",
          detail: started.error ?? "Native audio capture did not start.",
          action: "Check device permissions and selected input/output devices."
        },
        peak: source === "microphone" ? started.microphoneLevel : started.systemLevel
      };
    }

    await input.deps.wait(input.durationMs);
    const snapshot = await input.deps.saveCaptureSnapshot({ source, maxSeconds: input.snapshotSeconds });
    await input.deps.stopCapture();
    captureStopped = true;

    const peak = Math.max(
      source === "microphone" ? levels.microphonePeak : levels.systemPeak,
      source === "microphone" ? started.microphoneLevel : started.systemLevel
    );
    const status: LivePipelineSmokeStatus =
      snapshot.sampleCount > 0 && snapshot.durationMs > 0 ? (peak > 0 ? "ready" : "warning") : "blocked";

    return {
      snapshot,
      peak,
      item: {
        id: "audio",
        label: "Live audio snapshot",
        status,
        detail:
          status === "blocked"
            ? `Captured no usable ${sourceLabel(source)} samples.`
            : `Captured ${snapshot.durationMs}ms of ${sourceLabel(source)} audio for STT validation.`,
        action:
          status === "ready"
            ? undefined
            : `Play interview audio or speak into the ${sourceLabel(source)} source while the smoke check runs.`
      }
    };
  } catch (error) {
    return {
      item: {
        id: "audio",
        label: "Live audio snapshot",
        status: "blocked",
        detail: error instanceof Error ? error.message : String(error),
        action: "Fix the selected audio device and run the smoke check again."
      },
      peak: 0
    };
  } finally {
    cleanup?.();
    if (captureStarted && !captureStopped) {
      await input.deps.stopCapture().catch(() => undefined);
    }
  }
}

async function runSttSmoke(input: {
  config: AppConfig;
  snapshot: CaptureSnapshot;
  deps: LivePipelineSmokeDeps;
}): Promise<SttSmokeResult> {
  const mode = input.config.stt.selectedMode;
  if (mode === "manual") {
    return {
      events: [],
      item: {
        id: "stt",
        label: "Live STT smoke test",
        status: "blocked",
        detail: "Manual STT cannot validate live transcription.",
        action: "Choose Local Whisper, Deepgram, AssemblyAI, or Google STT."
      }
    };
  }

  const validation = validateSttConfig(mode, input.config);
  if (validation) {
    return {
      events: [],
      item: {
        id: "stt",
        label: sttLabel(mode),
        status: "blocked",
        detail: validation,
        action: "Finish STT setup in Audio And STT settings."
      }
    };
  }

  const started = input.deps.now();
  try {
    const events =
      mode === "local_whisper"
        ? await input.deps.transcribeWithLocalWhisper({
            binaryPath: input.config.stt.localWhisperBinaryPath,
            modelPath: input.config.stt.localWhisperModelPath,
            audioPath: input.snapshot.audioPath,
            language: normalizeLanguage(input.config.stt.language),
            diarizationEnabled: input.config.stt.diarizationEnabled
          })
        : await input.deps.transcribeWithCloudStt({
            provider: mode,
            apiKey: input.config.stt.apiKey ?? "",
            audioPath: input.snapshot.audioPath,
            language: normalizeLanguage(input.config.stt.language),
            diarizationEnabled: input.config.stt.diarizationEnabled,
            endpoint: input.config.stt.cloudEndpoint || undefined,
            localOnlyMode: input.config.security.localOnlyMode,
            blockCloudWhenLocalOnly: input.config.security.blockCloudWhenLocalOnly
          });
    const latencyMs = Math.max(0, Math.round(input.deps.now() - started));

    return {
      events,
      item: {
        id: "stt",
        label: `${sttLabel(mode)} smoke test`,
        status: events.length > 0 ? "ready" : "warning",
        detail:
          events.length > 0
            ? `Transcribed ${events.length} segment${events.length === 1 ? "" : "s"} from the live snapshot.`
            : "STT completed but returned no transcript segments.",
        latencyMs,
        action: events.length > 0 ? undefined : "Speak clearly or play call audio while the smoke check records."
      }
    };
  } catch (error) {
    return {
      events: [],
      item: {
        id: "stt",
        label: `${sttLabel(mode)} smoke test`,
        status: "blocked",
        detail: error instanceof Error ? error.message : String(error),
        action: "Fix STT setup, then run the smoke check again."
      }
    };
  }
}

async function runProviderSmoke(input: {
  config: AppConfig;
  transcriptEvents: SttTranscriptEvent[];
  deps: LivePipelineSmokeDeps;
}): Promise<ProviderSmokeResult> {
  const providerConfig = selectRunnableProviders(input.config)[0];
  if (!providerConfig) {
    return {
      item: {
        id: "provider",
        label: "AI provider smoke test",
        status: "blocked",
        detail: "No enabled AI provider is runnable.",
        action: "Enable a local provider or save a cloud provider key."
      }
    };
  }

  const provider = input.deps.createConfiguredProvider(providerConfig);
  const health = await provider.healthCheck();
  if (!health.ok) {
    return {
      item: {
        id: "provider",
        label: `${provider.label} health check`,
        status: "blocked",
        detail: health.error ?? `${provider.label} is not reachable.`,
        latencyMs: health.latencyMs,
        action: "Start the local model server or fix the provider endpoint/key."
      }
    };
  }

  const transcript = input.transcriptEvents.map((event) => event.text.trim()).filter(Boolean).join(" ");
  const started = input.deps.now();
  try {
    let firstChunk = "";
    for await (const chunk of provider.chatStream({
      temperature: 0,
      maxTokens: 24,
      messages: [
        {
          role: "system",
          content: "You are Caveman's live interview pipeline smoke test. Reply briefly."
        },
        {
          role: "user",
          content: `Reply with OK and one short hint for this transcript: ${transcript || "No transcript text was returned."}`
        }
      ]
    })) {
      firstChunk = chunk.trim();
      if (firstChunk) {
        break;
      }
    }

    const latencyMs = Math.max(0, Math.round(input.deps.now() - started));
    return {
      firstChunk,
      item: {
        id: "provider",
        label: `${provider.label} first chunk`,
        status: firstChunk ? "ready" : "warning",
        detail: firstChunk ? "Received the first AI chunk." : `${provider.label} completed without a text chunk.`,
        latencyMs,
        action: firstChunk ? undefined : "Check model name, provider logs, and response streaming support."
      }
    };
  } catch (error) {
    return {
      item: {
        id: "provider",
        label: `${provider.label} first chunk`,
        status: "blocked",
        detail: error instanceof Error ? error.message : String(error),
        action: "Fix provider configuration, then run the smoke check again."
      }
    };
  }
}

function buildResult(input: {
  startedAt: string;
  durationMs: number;
  transcriptSegments: number;
  firstAiChunk?: string;
  items: LivePipelineSmokeItem[];
}): LivePipelineSmokeResult {
  const blocked = input.items.find((item) => item.status === "blocked");
  const warning = input.items.find((item) => item.status === "warning");
  const status: LivePipelineSmokeStatus = blocked ? "blocked" : warning ? "warning" : "ready";
  return {
    ...input,
    status,
    message: blocked
      ? `Live pipeline smoke check blocked: ${blocked.label}.`
      : warning
        ? `Live pipeline smoke check needs attention: ${warning.label}.`
        : "Live pipeline smoke check passed."
  };
}

function validateSttConfig(mode: Exclude<SttMode, "manual">, config: AppConfig): string | undefined {
  if (mode === "local_whisper") {
    if (!config.stt.localWhisperBinaryPath.trim() || !config.stt.localWhisperModelPath.trim()) {
      return "Local Whisper needs both a binary path and model path.";
    }
    return undefined;
  }

  if (config.security.localOnlyMode && config.security.blockCloudWhenLocalOnly) {
    return "Local-only mode blocks cloud STT requests.";
  }

  if (!config.stt.apiKey?.trim() && !config.stt.apiKeyStored) {
    return `${sttLabel(mode)} needs an API key stored in the OS keychain.`;
  }

  return undefined;
}

function snapshotSource(mode: AppConfig["audio"]["captureMode"], dualStreamEnabled: boolean): "microphone" | "system" {
  if (mode === "system") {
    return "system";
  }

  if (mode === "dual" && dualStreamEnabled) {
    return "system";
  }

  return "microphone";
}

function createLevelAccumulator() {
  return {
    microphonePeak: 0,
    systemPeak: 0
  };
}

function recordLevel(levels: ReturnType<typeof createLevelAccumulator>, event: AudioLevelEvent) {
  const peak = Math.max(0, Math.min(1, event.peak || event.level || 0));
  if (event.source === "microphone") {
    levels.microphonePeak = Math.max(levels.microphonePeak, peak);
  }

  if (event.source === "system") {
    levels.systemPeak = Math.max(levels.systemPeak, peak);
  }
}

function depsWithDefaults(deps?: Partial<LivePipelineSmokeDeps>): LivePipelineSmokeDeps {
  return {
    onAudioLevel: deps?.onAudioLevel ?? onAudioLevel,
    startCapture: deps?.startCapture ?? startCapture,
    stopCapture: deps?.stopCapture ?? stopCapture,
    saveCaptureSnapshot: deps?.saveCaptureSnapshot ?? saveCaptureSnapshot,
    deleteCaptureSnapshot: deps?.deleteCaptureSnapshot ?? deleteCaptureSnapshot,
    transcribeWithLocalWhisper: deps?.transcribeWithLocalWhisper ?? transcribeWithLocalWhisper,
    transcribeWithCloudStt: deps?.transcribeWithCloudStt ?? transcribeWithCloudStt,
    createConfiguredProvider: deps?.createConfiguredProvider ?? createConfiguredProvider,
    wait: deps?.wait ?? wait,
    now: deps?.now ?? now
  };
}

function sttLabel(mode: SttMode): string {
  if (mode === "local_whisper") {
    return "Local Whisper";
  }

  if (mode === "deepgram") {
    return "Deepgram";
  }

  if (mode === "assemblyai") {
    return "AssemblyAI";
  }

  if (mode === "google") {
    return "Google STT";
  }

  return "Live STT";
}

function sourceLabel(source: "microphone" | "system"): string {
  return source === "microphone" ? "microphone" : "system audio";
}

function normalizeLanguage(language: string): string {
  return language.trim() || "auto";
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, durationMs));
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
