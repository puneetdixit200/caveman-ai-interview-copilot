import { Copy, Eye, EyeOff, FilePlus2, Keyboard, Link2, Play, Send, ShieldCheck, Square, Users, Volume2, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioControls } from "../components/audio/AudioControls";
import { CodeAssistantPanel } from "../components/code/CodeAssistantPanel";
import { Button } from "../components/common/Button";
import { OverlayWindow } from "../components/overlay/OverlayWindow";
import { TranscriptFeed, type InterimTranscriptPreview } from "../components/overlay/TranscriptFeed";
import { APP_CONFIG_SETTING_KEY, DEFAULT_APP_CONFIG, parseAppConfig } from "../lib/appConfig";
import { applyAudioLevelEvent, type AudioCaptureState } from "../lib/audioEvents";
import { shouldTriggerAnswer } from "../lib/autoTrigger";
import { buildChatMessages } from "../lib/contextBuilder";
import { DeepgramLiveTranscriber } from "../lib/deepgramStreaming";
import { LocalWhisperChunkTranscriber } from "../lib/localWhisperStreaming";
import { canSendOcrContext } from "../lib/ocr";
import { registerGlobalActionShortcuts } from "../lib/globalHotkeys";
import { DEFAULT_OVERLAY_SHORTCUT, overlayShortcutLabel } from "../lib/hotkeys";
import { shouldHideForPrivacyShield } from "../lib/overlaySafety";
import {
  KNOWLEDGE_BASE_SETTING_KEY,
  createKnowledgeBase,
  parseKnowledgeBase,
  searchKnowledgeBase,
  type KnowledgeBase
} from "../lib/knowledge";
import {
  PLUGIN_CATALOG_SETTING_KEY,
  createEmptyPluginCatalog,
  parsePluginCatalog,
  type PluginCatalog
} from "../lib/pluginLoader";
import { createConfiguredProvider } from "../lib/providerClients";
import { hydrateProviderApiKeys } from "../lib/providerSecrets";
import { selectRunnableProviders } from "../lib/providerSelection";
import { promptTemplates } from "../lib/promptTemplates";
import { estimateTokens, nextTranscriptTimestampMs } from "../lib/sessionRuntime";
import { resolveCalibratedSpeaker } from "../lib/speakerCalibration";
import { enqueueTtsResponse, playTtsItem, stopTtsPlayback } from "../lib/tts";
import { runLiveTranscriptionPass } from "../lib/liveTranscription";
import {
  addAiResponse,
  addTranscript,
  clearCollaborationHint,
  createSession,
  detectScreenShareStatus,
  getCaptureStatus,
  getCollaborationStatus,
  getSetting,
  isRunningInTauri,
  listAudioDevices,
  listAiResponses,
  listCollaborationHints,
  listSessions,
  listTranscripts,
  onAudioLevel,
  onAudioChunk,
  protectOverlayWindow,
  publishCollaborationSnapshot,
  startCollaborationServer,
  setCompanionWindowsVisible,
  setOverlayWindowBounds,
  setOverlayWindowVisible,
  startCapture,
  stopCollaborationServer,
  stopCapture,
  typeTextIntoActiveWindow
} from "../lib/tauri";
import { ProviderRouter } from "../lib/providerRouter";
import { useOverlayStore } from "../stores/overlayStore";
import type {
  AIResponseRecord,
  ChatMessage,
  InterviewType,
  SessionRecord,
  Speaker,
  SttTranscriptEvent,
  TranscriptSegment
} from "../types/session";
import type { AudioDevice } from "../types/settings";
import type { CollaborationHint, CollaborationServerStatus, CollaborationSnapshot } from "../types/collaboration";
import type { AppConfig } from "../lib/appConfig";
import type { OverlayProtectionStatus, ScreenShareStatus } from "../lib/tauri";

const TEMP_STREAM_ID = -1;
const DEFAULT_CAPTURE_STATUS: AudioCaptureState = {
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
};

const DEFAULT_COLLABORATION_STATUS: CollaborationServerStatus = {
  running: false,
  hintCount: 0
};

type AutoTypeResult = "disabled" | "typed" | "failed";

const INTERVIEW_TYPE_OPTIONS: Array<{ id: InterviewType; label: string }> = [
  { id: "system_design", label: "System Design" },
  { id: "dsa", label: "DSA / Coding" },
  { id: "frontend", label: "Frontend" },
  { id: "backend", label: "Backend" },
  { id: "devops_cloud", label: "DevOps / Cloud" },
  { id: "behavioral", label: "Behavioral" },
  { id: "hr", label: "HR / Culture" },
  { id: "mixed", label: "Mixed" }
];

const PRIVACY_SHIELD_INTERVAL_MS = 5000;

export function Dashboard() {
  const [running, setRunning] = useState(false);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [interimPreviews, setInterimPreviews] = useState<InterimTranscriptPreview[]>([]);
  const [responses, setResponses] = useState<AIResponseRecord[]>([]);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [captureStatus, setCaptureStatus] = useState<AudioCaptureState>(DEFAULT_CAPTURE_STATUS);
  const [overlayProtection, setOverlayProtection] = useState<OverlayProtectionStatus | null>(null);
  const [screenShareStatus, setScreenShareStatus] = useState<ScreenShareStatus | null>(null);
  const [overlayShortcut, setOverlayShortcut] = useState(DEFAULT_OVERLAY_SHORTCUT);
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [manualSpeaker, setManualSpeaker] = useState<Speaker>("interviewer");
  const [manualTranscript, setManualTranscript] = useState("");
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionCompany, setNewSessionCompany] = useState("");
  const [newSessionRole, setNewSessionRole] = useState("");
  const [newSessionInterviewType, setNewSessionInterviewType] = useState<InterviewType>("system_design");
  const [newSessionTags, setNewSessionTags] = useState("");
  const [newSessionNotes, setNewSessionNotes] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [lastTriggeredTranscriptId, setLastTriggeredTranscriptId] = useState<number | undefined>();
  const [statusMessage, setStatusMessage] = useState("Loading session...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase>(createKnowledgeBase());
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalog>(createEmptyPluginCatalog());
  const [collaborationStatus, setCollaborationStatus] =
    useState<CollaborationServerStatus>(DEFAULT_COLLABORATION_STATUS);
  const [collaborationHints, setCollaborationHints] = useState<CollaborationHint[]>([]);
  const [collaborationMessage, setCollaborationMessage] = useState<string | null>(null);
  const seenLiveTranscriptKeys = useRef(new Set<string>());
  const liveTranscriptionBusy = useRef(false);
  const captureShortcutAction = useRef<() => void>(() => undefined);
  const generateShortcutAction = useRef<() => void>(() => undefined);
  const typeLatestShortcutAction = useRef<() => void>(() => undefined);
  const { visible, setVisible, opacity, setOpacity, fontSize, setFontSize, locked, setLocked } = useOverlayStore();

  const selectedProvider = useMemo(
    () => config.providers.find((provider) => provider.id === config.selectedProviderId) ?? config.providers[0],
    [config.providers, config.selectedProviderId]
  );

  const availablePromptTemplates = useMemo(
    () => [...promptTemplates, ...pluginCatalog.promptTemplates],
    [pluginCatalog.promptTemplates]
  );

  const template = useMemo(
    () => availablePromptTemplates.find((item) => item.category === session?.interviewType) ?? availablePromptTemplates[0],
    [availablePromptTemplates, session?.interviewType]
  );

  const setNativeOverlayVisible = useCallback(
    async (nextVisible: boolean) => {
      if (nextVisible) {
        await setOverlayWindowBounds(config.overlay.bounds, config.security.captureExclusionEnabled);
        const status = await protectOverlayWindow(config.security.captureExclusionEnabled);
        const guardStatus = await detectScreenShareStatusFailClosed();
        setScreenShareStatus(guardStatus);

        if (
          shouldHideForPrivacyShield({
            captureExclusion: status.captureExclusion,
            screenShareDetected: guardStatus.active
          })
        ) {
          const hiddenStatus = await setOverlayWindowVisible(false, config.security.captureExclusionEnabled);
          await setCompanionWindowsVisible(false, config.security.captureExclusionEnabled);
          setOverlayProtection(hiddenStatus);
          setOverlayMessage(overlayAutoHideMessage(guardStatus));
          setVisible(false);
          return;
        }
      }
      setVisible(nextVisible);
      const status = await setOverlayWindowVisible(nextVisible, config.security.captureExclusionEnabled);

      if (nextVisible && status.visible && status.captureExclusion === "enabled") {
        await setCompanionWindowsVisible(true, config.security.captureExclusionEnabled);
      } else if (nextVisible) {
        await setCompanionWindowsVisible(false, config.security.captureExclusionEnabled);
      }
      setOverlayProtection(status);
      setOverlayMessage(status.message ?? (nextVisible ? "Overlay shown" : "Overlay hidden"));

      if (status.visible !== nextVisible) {
        setVisible(status.visible);
      }
    },
    [config.overlay.bounds, config.security.captureExclusionEnabled, setVisible]
  );

  const toggleOverlayWindow = useCallback(() => {
    const nextVisible = !useOverlayStore.getState().visible;
    void setNativeOverlayVisible(nextVisible);
  }, [setNativeOverlayVisible]);

  const refreshSessionData = useCallback(async (sessionId: string) => {
    const [freshTranscripts, freshResponses] = await Promise.all([
      listTranscripts(sessionId),
      listAiResponses(sessionId)
    ]);
    setTranscripts(freshTranscripts);
    setResponses([...freshResponses].reverse());
  }, []);

  const refreshCollaborationHints = useCallback(async () => {
    try {
      const hints = await listCollaborationHints();
      setCollaborationHints(hints);
      setCollaborationStatus((current) => ({ ...current, hintCount: hints.length }));
    } catch (error) {
      setCollaborationMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [rawConfig, rawKnowledgeBase, rawPluginCatalog] = await Promise.all([
          getSetting(APP_CONFIG_SETTING_KEY),
          getSetting(KNOWLEDGE_BASE_SETTING_KEY),
          getSetting(PLUGIN_CATALOG_SETTING_KEY)
        ]);
        const storedConfig = parseAppConfig(rawConfig);
        const hydratedConfig = await hydrateProviderApiKeys(storedConfig);
        const [sessions, devices, status, collaboration] = await Promise.all([
          listSessions(),
          listAudioDevices(),
          getCaptureStatus(),
          getCollaborationStatus()
        ]);
        const activeSession =
          sessions.find((item) => item.status === "active") ??
          (await createSession({
            title: "Live Interview Session",
            company: "",
            role: "",
            interviewType: "system_design",
            tags: ["real-use"],
            notes: "Manual transcript mode until audio/STT is configured."
          }));

        if (cancelled) {
          return;
        }

        setConfig(hydratedConfig);
        setOpacity(hydratedConfig.overlay.opacity);
        setFontSize(hydratedConfig.overlay.fontSize);
        setLocked(hydratedConfig.overlay.locked);
        await setOverlayWindowBounds(hydratedConfig.overlay.bounds, hydratedConfig.security.captureExclusionEnabled);
        setKnowledgeBase(parseKnowledgeBase(rawKnowledgeBase));
        setPluginCatalog(parsePluginCatalog(rawPluginCatalog));
        setAudioDevices(devices);
        setCaptureStatus(status);
        setCollaborationStatus(collaboration);
        setRunning(status.running);
        setSession(activeSession);
        await refreshSessionData(activeSession.id);
        setStatusMessage(`Ready with ${hydratedConfig.selectedProviderId}`);
        setSettingsLoaded(true);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setStatusMessage("Could not load session");
          setSettingsLoaded(true);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshSessionData]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    onAudioLevel((event) => {
      if (disposed) {
        return;
      }

      setAudioDevices((current) => applyAudioLevelEvent(current, event));
      setCaptureStatus((current) => ({
        ...current,
        microphoneLevel: event.source === "microphone" ? event.level : current.microphoneLevel,
        systemLevel: event.source === "system" ? event.level : current.systemLevel
      }));
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }

      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    let cancelled = false;
    let intervalId: number | undefined;

    async function applyOverlayProtection() {
      const status = await protectOverlayWindow(config.security.captureExclusionEnabled);
      if (cancelled) {
        return;
      }
      const guardStatus = await detectScreenShareStatusFailClosed();
      if (cancelled) {
        return;
      }
      setScreenShareStatus(guardStatus);

      if (
        shouldHideForPrivacyShield({
          captureExclusion: status.captureExclusion,
          screenShareDetected: guardStatus?.active ?? false
        })
      ) {
        const hiddenStatus = await setOverlayWindowVisible(false, config.security.captureExclusionEnabled);
        await setCompanionWindowsVisible(false, config.security.captureExclusionEnabled);
        if (!cancelled) {
          setOverlayProtection(hiddenStatus);
          setOverlayMessage(overlayAutoHideMessage(guardStatus));
          setVisible(false);
        }
        return;
      }

      await setCompanionWindowsVisible(true, config.security.captureExclusionEnabled);
      if (cancelled) {
        return;
      }
      setOverlayProtection(status);
      setOverlayMessage(status.message ?? null);
      if (isRunningInTauri()) {
        setVisible(status.visible);
      }
    }

    void applyOverlayProtection();
    intervalId = window.setInterval(() => {
      void applyOverlayProtection();
    }, PRIVACY_SHIELD_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [config.security.captureExclusionEnabled, settingsLoaded, setVisible]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => Promise<void>) | undefined;

    registerGlobalActionShortcuts({
      actions: [
        {
          id: "overlay",
          shortcut: config.shortcuts.overlayToggle,
          onPressed: toggleOverlayWindow
        },
        {
          id: "capture",
          shortcut: config.shortcuts.captureToggle,
          onPressed: () => captureShortcutAction.current()
        },
        {
          id: "generate",
          shortcut: config.shortcuts.generateAnswer,
          onPressed: () => generateShortcutAction.current()
        },
        {
          id: "type-latest",
          shortcut: config.shortcuts.typeLatestAnswer,
          onPressed: () => typeLatestShortcutAction.current()
        }
      ]
    }).then((registration) => {
      if (disposed) {
        void registration.dispose();
        return;
      }

      cleanup = registration.dispose;
      setOverlayShortcut(registration.registeredShortcuts.overlay ?? config.shortcuts.overlayToggle);
      const firstError = Object.entries(registration.errors)[0];
      if (firstError) {
        setOverlayMessage(`Global shortcut unavailable (${firstError[0]}): ${firstError[1]}`);
      }
    });

    return () => {
      disposed = true;
      void cleanup?.();
    };
  }, [config.shortcuts, toggleOverlayWindow]);

  useEffect(() => {
    seenLiveTranscriptKeys.current.clear();
    setInterimPreviews([]);
  }, [session?.id]);

  useEffect(() => {
    if (!collaborationStatus.running) {
      return;
    }

    publishCollaborationSnapshot(buildCollaborationSnapshot(session, transcripts, responses)).catch((error) => {
      setCollaborationMessage(error instanceof Error ? error.message : String(error));
    });
  }, [collaborationStatus.running, responses, session, transcripts]);

  useEffect(() => {
    if (!collaborationStatus.running) {
      return;
    }

    let disposed = false;

    async function refresh() {
      if (disposed) {
        return;
      }
      await refreshCollaborationHints();
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 2500);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [collaborationStatus.running, refreshCollaborationHints]);

  useEffect(() => {
    if (!running || !session || !isSnapshotSttMode(config.stt.selectedMode)) {
      return;
    }

    let disposed = false;

    async function transcribeLiveAudio() {
      if (!session || liveTranscriptionBusy.current) {
        return;
      }

      liveTranscriptionBusy.current = true;
      try {
        const saved = await runLiveTranscriptionPass({
          sessionId: session.id,
          sessionStartedAt: session.createdAt,
          config,
          seenTranscriptKeys: seenLiveTranscriptKeys.current
        });

        if (disposed || saved.length === 0) {
          return;
        }

        setTranscripts((current) => {
          const nextTranscripts = [...current, ...saved];
          const latest = saved[saved.length - 1];
          const trigger = shouldTriggerAnswer({
            segments: nextTranscripts,
            settings: config.autoTrigger,
            lastTriggeredTranscriptId,
            nowMs: latest.timestampMs + config.autoTrigger.silenceTimeoutMs
          });

          if (trigger.shouldTrigger && trigger.transcriptId) {
            setLastTriggeredTranscriptId(trigger.transcriptId);
            setStatusMessage(`Live STT detected ${trigger.reason}; generating answer...`);
            void generateResponse(nextTranscripts, trigger.transcriptId);
          }

          return nextTranscripts;
        });
        setStatusMessage(`Live STT saved ${saved.length} transcript segment${saved.length === 1 ? "" : "s"}`);
      } catch (error) {
        if (!disposed) {
          setStatusMessage("Live STT failed");
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      } finally {
        liveTranscriptionBusy.current = false;
      }
    }

    void transcribeLiveAudio();
    const interval = window.setInterval(() => void transcribeLiveAudio(), 6500);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [config, lastTriggeredTranscriptId, running, session?.id]);

  useEffect(() => {
    if (!running || !session || config.stt.selectedMode !== "local_whisper") {
      return;
    }

    const binaryPath = config.stt.localWhisperBinaryPath.trim();
    const modelPath = config.stt.localWhisperModelPath.trim();
    if (!binaryPath || !modelPath) {
      setStatusMessage("Set the local Whisper binary and model paths before starting streaming STT.");
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;
    const streamStartedAtMs = Date.now();
    const sessionStartedAtMs = Date.parse(session.createdAt);
    const sessionOffsetMs = Number.isFinite(sessionStartedAtMs)
      ? Math.max(0, streamStartedAtMs - sessionStartedAtMs)
      : 0;
    const transcribers = new Map<"microphone" | "system", LocalWhisperChunkTranscriber>();

    async function saveStreamingTranscript(event: SttTranscriptEvent, source: "microphone" | "system") {
      if (!session || disposed) {
        return;
      }

      const text = event.text.trim();
      if (!text) {
        return;
      }

      const speaker = resolveCalibratedSpeaker({
        speaker: event.speaker,
        providerSpeaker: event.providerSpeaker,
        source,
        calibration: config.stt.speakerCalibration
      });
      const key = `${speaker}:${text.toLowerCase().replace(/\s+/g, " ")}`;
      if (seenLiveTranscriptKeys.current.has(key)) {
        return;
      }
      seenLiveTranscriptKeys.current.add(key);

      try {
        const saved = await addTranscript({
          sessionId: session.id,
          speaker,
          content: text,
          timestampMs: sessionOffsetMs + event.startMs,
          confidence: event.confidence,
          source,
          language: event.language
        });

        if (disposed) {
          return;
        }

        setTranscripts((current) => {
          const nextTranscripts = [...current, saved];
          const trigger = shouldTriggerAnswer({
            segments: nextTranscripts,
            settings: config.autoTrigger,
            lastTriggeredTranscriptId,
            nowMs: saved.timestampMs + config.autoTrigger.silenceTimeoutMs
          });

          if (trigger.shouldTrigger && trigger.transcriptId) {
            setLastTriggeredTranscriptId(trigger.transcriptId);
            setStatusMessage(`Local Whisper detected ${trigger.reason}; generating answer...`);
            void generateResponse(nextTranscripts, trigger.transcriptId);
          }

          return nextTranscripts;
        });
        setStatusMessage("Local Whisper streaming STT saved a transcript segment");
      } catch (error) {
        if (!disposed) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setStatusMessage("Local Whisper streaming STT failed");
        }
      }
    }

    function getTranscriber(source: "microphone" | "system") {
      const existing = transcribers.get(source);
      if (existing) {
        return existing;
      }

      const transcriber = new LocalWhisperChunkTranscriber({
        source,
        binaryPath,
        modelPath,
        language: config.stt.language || "auto",
        diarizationEnabled: config.stt.diarizationEnabled,
        onTranscript: (event) => void saveStreamingTranscript(event, source),
        onStatus: (message) => {
          if (!disposed) {
            setStatusMessage(message);
          }
        },
        onError: (error) => {
          if (!disposed) {
            setErrorMessage(error.message);
            setStatusMessage("Local Whisper streaming STT failed");
          }
        }
      });
      transcribers.set(source, transcriber);
      return transcriber;
    }

    onAudioChunk((chunk) => {
      if (chunk.source !== "microphone" && chunk.source !== "system") {
        return;
      }

      getTranscriber(chunk.source).sendChunk(chunk);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      cleanup = unlisten;
    });
    setStatusMessage("Local Whisper streaming STT armed");

    return () => {
      disposed = true;
      cleanup?.();
      for (const transcriber of transcribers.values()) {
        void transcriber.close();
      }
    };
  }, [
    config.autoTrigger,
    config.stt.diarizationEnabled,
    config.stt.language,
    config.stt.localWhisperBinaryPath,
    config.stt.localWhisperModelPath,
    config.stt.selectedMode,
    config.stt.speakerCalibration,
    lastTriggeredTranscriptId,
    running,
    session?.createdAt,
    session?.id
  ]);

  useEffect(() => {
    if (!running || !session || config.stt.selectedMode !== "deepgram") {
      return;
    }

    if (isCloudBlocked(config)) {
      setStatusMessage("Cloud STT is blocked by local-only mode.");
      return;
    }

    const apiKey = config.stt.apiKey?.trim() ?? "";
    if (!apiKey) {
      setStatusMessage("Save a Deepgram STT API key before starting streaming transcription.");
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;
    const streamStartedAtMs = Date.now();
    const sessionStartedAtMs = Date.parse(session.createdAt);
    const sessionOffsetMs = Number.isFinite(sessionStartedAtMs)
      ? Math.max(0, streamStartedAtMs - sessionStartedAtMs)
      : 0;
    const transcribers = new Map<"microphone" | "system", DeepgramLiveTranscriber>();

    async function saveStreamingTranscript(event: SttTranscriptEvent, source: "microphone" | "system") {
      if (!session || disposed) {
        return;
      }

      const text = event.text.trim();
      if (!text) {
        return;
      }

      const speaker = resolveCalibratedSpeaker({
        speaker: event.speaker,
        providerSpeaker: event.providerSpeaker,
        source,
        calibration: config.stt.speakerCalibration
      });
      const key = `${speaker}:${text.toLowerCase().replace(/\s+/g, " ")}`;
      if (seenLiveTranscriptKeys.current.has(key)) {
        return;
      }
      seenLiveTranscriptKeys.current.add(key);

      try {
        const saved = await addTranscript({
          sessionId: session.id,
          speaker,
          content: text,
          timestampMs: sessionOffsetMs + event.startMs,
          confidence: event.confidence,
          source,
          language: event.language
        });

        if (disposed) {
          return;
        }

        setInterimPreviews((current) => current.filter((preview) => preview.source !== source));

        setTranscripts((current) => {
          const nextTranscripts = [...current, saved];
          const trigger = shouldTriggerAnswer({
            segments: nextTranscripts,
            settings: config.autoTrigger,
            lastTriggeredTranscriptId,
            nowMs: saved.timestampMs + config.autoTrigger.silenceTimeoutMs
          });

          if (trigger.shouldTrigger && trigger.transcriptId) {
            setLastTriggeredTranscriptId(trigger.transcriptId);
            setStatusMessage(`Deepgram detected ${trigger.reason}; generating answer...`);
            void generateResponse(nextTranscripts, trigger.transcriptId);
          }

          return nextTranscripts;
        });
        setStatusMessage("Deepgram streaming STT saved a transcript segment");
      } catch (error) {
        if (!disposed) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setStatusMessage("Deepgram streaming STT failed");
        }
      }
    }

    function previewStreamingTranscript(event: SttTranscriptEvent, source: "microphone" | "system") {
      const text = event.text.trim();
      if (!text || disposed) {
        return;
      }

      setInterimPreviews((current) => {
        const speaker = resolveCalibratedSpeaker({
          speaker: event.speaker,
          providerSpeaker: event.providerSpeaker,
          source,
          calibration: config.stt.speakerCalibration
        });
        const nextPreview: InterimTranscriptPreview = {
          id: `deepgram-${source}`,
          speaker,
          content: text,
          timestampMs: sessionOffsetMs + event.startMs,
          confidence: event.confidence,
          source
        };

        return [nextPreview, ...current.filter((preview) => preview.id !== nextPreview.id)].slice(0, 2);
      });
    }

    function getTranscriber(source: "microphone" | "system") {
      const existing = transcribers.get(source);
      if (existing) {
        return existing;
      }

      const transcriber = new DeepgramLiveTranscriber({
        apiKey,
        source,
        language: config.stt.language || "auto",
        diarizationEnabled: config.stt.diarizationEnabled,
        endpoint: websocketSttEndpoint(config.stt.cloudEndpoint),
        onTranscript: (event) => void saveStreamingTranscript(event, source),
        onInterimTranscript: (event) => previewStreamingTranscript(event, source),
        onStatus: (message) => {
          if (!disposed) {
            setStatusMessage(message);
          }
        },
        onError: (error) => {
          if (!disposed) {
            setErrorMessage(error.message);
            setStatusMessage("Deepgram streaming STT failed");
          }
        }
      });
      transcribers.set(source, transcriber);
      return transcriber;
    }

    onAudioChunk((chunk) => {
      if (chunk.source !== "microphone" && chunk.source !== "system") {
        return;
      }

      getTranscriber(chunk.source).sendChunk(chunk);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      cleanup = unlisten;
    });
    setStatusMessage("Deepgram streaming STT armed");

    return () => {
      disposed = true;
      cleanup?.();
      for (const transcriber of transcribers.values()) {
        transcriber.close();
      }
    };
  }, [
    config.autoTrigger,
    config.stt.apiKey,
    config.stt.cloudEndpoint,
    config.stt.diarizationEnabled,
    config.stt.language,
    config.stt.selectedMode,
    config.stt.speakerCalibration,
    lastTriggeredTranscriptId,
    running,
    session?.createdAt,
    session?.id
  ]);

  async function startHelperLink() {
    try {
      const status = await startCollaborationServer({ bindHost: "127.0.0.1", port: 0 });
      setCollaborationStatus(status);
      setCollaborationMessage(status.message ?? (status.running ? "Helper link started" : "Helper link unavailable"));
      if (status.running) {
        await publishCollaborationSnapshot(buildCollaborationSnapshot(session, transcripts, responses));
        await refreshCollaborationHints();
      }
    } catch (error) {
      setCollaborationMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function stopHelperLink() {
    const status = await stopCollaborationServer();
    setCollaborationStatus(status);
    setCollaborationHints([]);
    setCollaborationMessage(status.message ?? "Helper link stopped");
  }

  async function copyHelperLink() {
    if (!collaborationStatus.url) {
      return;
    }

    try {
      await navigator.clipboard?.writeText(collaborationStatus.url);
      setCollaborationMessage("Helper link copied");
    } catch {
      setCollaborationMessage("Could not copy helper link");
    }
  }

  async function dismissCollaborationHint(id: string) {
    try {
      await clearCollaborationHint(id);
      setCollaborationHints((current) => current.filter((hint) => hint.id !== id));
      setCollaborationStatus((current) => ({
        ...current,
        hintCount: Math.max(0, current.hintCount - 1)
      }));
    } catch (error) {
      setCollaborationMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function toggleCapture() {
    if (running) {
      const stopped = await stopCapture();
      setCaptureStatus(stopped);
      setRunning(false);
      setAudioDevices((current) => current.map((device) => ({ ...device, level: 0 })));
      setInterimPreviews([]);
      setStatusMessage("Audio capture stopped");
      return;
    }

    if (config.audio.captureMode === "manual") {
      setCaptureStatus({
        ...DEFAULT_CAPTURE_STATUS,
        gainDb: config.audio.gainDb,
        noiseGateDb: config.audio.noiseGateDb
      });
      setRunning(true);
      setErrorMessage(null);
      setStatusMessage("Manual transcript mode active");
      return;
    }

    try {
      const started = await startCapture({
        captureMode: config.audio.captureMode,
        dualStreamEnabled: config.audio.dualStreamEnabled,
        systemDeviceId: config.audio.systemDeviceId,
        microphoneDeviceId: config.audio.microphoneDeviceId,
        applicationTargetId: config.audio.applicationTargetId,
        applicationTargetLabel: config.audio.applicationTargetLabel,
        gainDb: config.audio.gainDb,
        noiseGateDb: config.audio.noiseGateDb
      });
      setCaptureStatus(started);
      setRunning(started.running);
      setErrorMessage(null);
      setStatusMessage(
        started.running
          ? `Microphone capture running at ${started.sampleRateHz}Hz`
          : started.error ?? "Audio capture did not start"
      );
    } catch (error) {
      setRunning(false);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatusMessage("Audio capture failed");
    }
  }

  async function startNewSession() {
    const interviewTypeLabel =
      INTERVIEW_TYPE_OPTIONS.find((option) => option.id === newSessionInterviewType)?.label ?? "Interview";
    const title = newSessionTitle.trim() || `${interviewTypeLabel} Session`;

    try {
      if (running) {
        const stopped = await stopCapture();
        setCaptureStatus(stopped);
        setRunning(false);
        setAudioDevices((current) => current.map((device) => ({ ...device, level: 0 })));
        setInterimPreviews([]);
      }

      const created = await createSession({
        title,
        company: newSessionCompany.trim(),
        role: newSessionRole.trim(),
        interviewType: newSessionInterviewType,
        tags: parseSessionTags(newSessionTags),
        notes: newSessionNotes.trim()
      });

      seenLiveTranscriptKeys.current.clear();
      setSession(created);
      setTranscripts([]);
      setResponses([]);
      setInterimPreviews([]);
      setManualTranscript("");
      setLastTriggeredTranscriptId(undefined);
      setErrorMessage(null);
      setStatusMessage(`Started ${created.title}`);
      setNewSessionTitle("");
      setNewSessionCompany("");
      setNewSessionRole("");
      setNewSessionTags("");
      setNewSessionNotes("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatusMessage("Could not start new session");
    }
  }

  async function saveManualTranscript() {
    if (!session) {
      setErrorMessage("Session is still loading.");
      return;
    }

    const content = manualTranscript.trim();
    if (!content) {
      setErrorMessage("Type what the interviewer or you said before saving.");
      return;
    }

    setErrorMessage(null);
    const saved = await addTranscript({
      sessionId: session.id,
      speaker: manualSpeaker,
      content,
      timestampMs: nextTranscriptTimestampMs(new Date(session.createdAt)),
      confidence: 1,
      source: "manual",
      language: config.stt.language && config.stt.language !== "auto" ? config.stt.language : undefined
    });
    const nextTranscripts = [...transcripts, saved];
    setTranscripts(nextTranscripts);
    setManualTranscript("");
    setStatusMessage("Transcript saved");

    const trigger = shouldTriggerAnswer({
      segments: nextTranscripts,
      settings: config.autoTrigger,
      lastTriggeredTranscriptId,
      nowMs: saved.timestampMs + config.autoTrigger.silenceTimeoutMs
    });

    if (running && trigger.shouldTrigger && trigger.transcriptId) {
      setLastTriggeredTranscriptId(trigger.transcriptId);
      setStatusMessage(`Question detected by ${trigger.reason}; generating answer...`);
      await generateResponse(nextTranscripts, trigger.transcriptId);
    }
  }

  async function generateResponse(transcriptInput = transcripts, triggerTranscriptId?: number) {
    if (!session) {
      setErrorMessage("Session is still loading.");
      return;
    }

    if (transcriptInput.length === 0) {
      setErrorMessage("Add at least one transcript line before generating an answer.");
      return;
    }

    const runnableProviderConfigs = selectRunnableProviders(config);
    const providers = runnableProviderConfigs.map((provider) =>
      createConfiguredProvider(provider, undefined, {
        localOnlyMode: config.security.localOnlyMode,
        blockCloudWhenLocalOnly: config.security.blockCloudWhenLocalOnly
      })
    );
    if (providers.length === 0) {
      setErrorMessage(
        config.security.localOnlyMode
          ? "Enable at least one local provider or turn off local-only mode in Settings."
          : "Enable at least one provider in Settings."
      );
      return;
    }

    setStreaming(true);
    setErrorMessage(null);
    setStatusMessage(`Streaming from ${providers[0].label}...`);

    const messages = buildPromptMessages(config, transcriptInput, template, knowledgeBase);
    const activeModel = runnableProviderConfigs[0]?.model ?? selectedProvider.model;
    const router = new ProviderRouter(providers);
    const startedAt = performance.now();
    let response = "";

    try {
      for await (const chunk of router.chatStream({
        messages,
        model: activeModel,
        maxTokens: config.contextWindow.reservedResponseTokens
      })) {
        response += chunk;
        setResponses((current) => [
          {
            id: TEMP_STREAM_ID,
            sessionId: session.id,
            provider: providers[0].id,
            model: activeModel,
            response,
            latencyMs: Math.round(performance.now() - startedAt),
            createdAt: new Date().toISOString()
          },
          ...current.filter((item) => item.id !== TEMP_STREAM_ID)
        ]);
      }

      if (!response.trim()) {
        throw new Error("Provider returned an empty response.");
      }

      const saved = await addAiResponse({
        sessionId: session.id,
        triggerTranscriptId,
        promptMessages: JSON.stringify(messages),
        response,
        model: activeModel,
        provider: providers[0].id,
        inputTokens: estimateTokens(messages.map((message) => message.content).join("\n")),
        outputTokens: estimateTokens(response),
        latencyMs: Math.round(performance.now() - startedAt)
      });

      setResponses((current) => [saved, ...current.filter((item) => item.id !== TEMP_STREAM_ID)]);
      const autoTypeResult = await autoTypeGeneratedAnswer(saved.response);
      const ttsQueue = config.tts.autoPlay ? enqueueTtsResponse([], response, config.tts, visible) : [];
      const played = ttsQueue[0] ? playTtsItem(ttsQueue[0]) : false;
      if (autoTypeResult === "typed") {
        setStatusMessage("AI response saved and auto-typed into the active window");
      } else if (autoTypeResult === "disabled") {
        setStatusMessage(played ? "AI response saved and spoken" : "AI response saved to this session");
      }
    } catch (error) {
      setResponses((current) => current.filter((item) => item.id !== TEMP_STREAM_ID));
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatusMessage("Provider request failed");
    } finally {
      setStreaming(false);
    }
  }

  async function autoTypeGeneratedAnswer(response: string): Promise<AutoTypeResult> {
    if (!config.autoAnswer.enabled || !config.autoAnswer.typeIntoActiveWindow) {
      return "disabled";
    }

    const text = response.trim();
    if (!text) {
      return "disabled";
    }

    if (config.autoAnswer.delayMs > 0) {
      setStatusMessage(`AI response saved; auto-typing in ${Math.ceil(config.autoAnswer.delayMs / 1000)}s`);
      await wait(config.autoAnswer.delayMs);
    }

    try {
      await typeTextIntoActiveWindow(text);
      setErrorMessage(null);
      return "typed";
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatusMessage("AI response saved, but auto-typing failed");
      return "failed";
    }
  }

  async function typeLatestAnswer() {
    const latestResponse = responses.find((item) => item.id !== TEMP_STREAM_ID && item.response.trim());
    if (!latestResponse) {
      setErrorMessage("Generate or save an AI response before typing it into another app.");
      setStatusMessage("No AI response available to type");
      return;
    }

    try {
      const typed = await typeTextIntoActiveWindow(latestResponse.response);
      setErrorMessage(null);
      setStatusMessage(`Typed ${typed.characterCount} answer characters into the active window`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatusMessage("Could not type latest answer");
    }
  }

  function speakLatestAnswer() {
    const latestResponse = responses.find((item) => item.id !== TEMP_STREAM_ID && item.response.trim());
    if (!latestResponse) {
      setErrorMessage("Generate or save an AI response before speaking it.");
      setStatusMessage("No AI response available to speak");
      return;
    }

    const ttsQueue = enqueueTtsResponse([], latestResponse.response, config.tts, visible);
    const played = ttsQueue[0] ? playTtsItem(ttsQueue[0]) : false;
    setErrorMessage(null);

    if (played) {
      setStatusMessage("Speaking latest answer");
      return;
    }

    if (!config.tts.enabled) {
      setStatusMessage("Enable TTS in Settings before speaking the latest answer");
      return;
    }

    if (visible && config.tts.muteInStealth) {
      setStatusMessage("TTS is muted while the overlay is visible");
      return;
    }

    setStatusMessage("TTS playback is not available in this environment");
  }

  function stopSpeaking() {
    stopTtsPlayback();
    setStatusMessage("TTS playback stopped");
  }

  captureShortcutAction.current = () => {
    void toggleCapture();
  };
  generateShortcutAction.current = () => {
    void generateResponse();
  };
  typeLatestShortcutAction.current = () => {
    void typeLatestAnswer();
  };

  return (
    <main className="dashboard-grid">
      <section className="panel command-panel">
        <div className="session-title">
          <p className="eyebrow">Active Session</p>
          <h1>{session?.title ?? "Loading Session"}</h1>
          <span className={`status-pill ${running ? "status-live" : "status-muted"}`}>
            {running ? "Ready" : "Paused"}
          </span>
        </div>

        <div className="command-actions">
          <Button
            variant={running ? "danger" : "primary"}
            icon={running ? <Square size={16} /> : <Play size={16} />}
            onClick={toggleCapture}
          >
            {running ? "Stop" : "Start"}
          </Button>
          <Button icon={visible ? <EyeOff size={16} /> : <Eye size={16} />} onClick={toggleOverlayWindow}>
            {visible ? "Hide Overlay" : "Show Overlay"}
          </Button>
          <Button variant="primary" icon={<Wand2 size={16} />} onClick={() => generateResponse()} disabled={streaming}>
            {streaming ? "Streaming" : "Generate"}
          </Button>
          <Button icon={<Keyboard size={16} />} onClick={typeLatestAnswer} disabled={streaming}>
            Type Latest
          </Button>
          <Button icon={<Volume2 size={16} />} onClick={speakLatestAnswer} disabled={streaming}>
            Speak Latest
          </Button>
          <Button icon={<Square size={16} />} onClick={stopSpeaking}>
            Stop Speech
          </Button>
        </div>

        <div className="metric-strip">
          <div>
            <span>Mode</span>
            <strong>
              {captureStatus.running
                ? `${config.audio.captureMode === "manual" ? "microphone" : config.audio.captureMode} live`
                : config.audio.captureMode === "manual"
                  ? "manual transcript"
                  : config.audio.captureMode}
            </strong>
          </div>
          <div>
            <span>Provider</span>
            <strong>{selectedProvider?.label ?? "not configured"}</strong>
          </div>
          <div>
            <span>Model</span>
            <strong>{selectedProvider?.model ?? "none"}</strong>
          </div>
          <div>
            <span>Saved</span>
            <strong>{responses.filter((item) => item.id !== TEMP_STREAM_ID).length} responses</strong>
          </div>
        </div>

        <div className="session-setup-form">
          <div className="session-setup-heading">
            <div>
              <p className="eyebrow">Session</p>
              <h2>Interview Setup</h2>
            </div>
            <Button icon={<FilePlus2 size={16} />} onClick={startNewSession}>
              Start New Session
            </Button>
          </div>
          <div className="session-setup-grid">
            <label>
              <span>Title</span>
              <input
                aria-label="New session title"
                value={newSessionTitle}
                onChange={(event) => setNewSessionTitle(event.currentTarget.value)}
                placeholder="Frontend Loop"
              />
            </label>
            <label>
              <span>Company</span>
              <input
                aria-label="New session company"
                value={newSessionCompany}
                onChange={(event) => setNewSessionCompany(event.currentTarget.value)}
                placeholder="Acme"
              />
            </label>
            <label>
              <span>Role</span>
              <input
                aria-label="New session role"
                value={newSessionRole}
                onChange={(event) => setNewSessionRole(event.currentTarget.value)}
                placeholder="Senior Engineer"
              />
            </label>
            <label>
              <span>Type</span>
              <select
                aria-label="New session interview type"
                value={newSessionInterviewType}
                onChange={(event) => setNewSessionInterviewType(event.currentTarget.value as InterviewType)}
              >
                {INTERVIEW_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tags</span>
              <input
                aria-label="New session tags"
                value={newSessionTags}
                onChange={(event) => setNewSessionTags(event.currentTarget.value)}
                placeholder="react, accessibility"
              />
            </label>
            <label className="session-notes-field">
              <span>Notes</span>
              <textarea
                aria-label="New session notes"
                value={newSessionNotes}
                onChange={(event) => setNewSessionNotes(event.currentTarget.value)}
                placeholder="Focus points for this round"
              />
            </label>
          </div>
        </div>

        <div className="collaboration-strip">
          <div className="collaboration-header">
            <div>
              <p className="eyebrow">Helper</p>
              <h2>Collaborative Link</h2>
            </div>
            <span className={`status-pill ${collaborationStatus.running ? "status-live" : "status-muted"}`}>
              {collaborationStatus.running ? "Live" : "Off"}
            </span>
          </div>
          <div className="collaboration-actions">
            <Button
              variant={collaborationStatus.running ? "danger" : "secondary"}
              icon={collaborationStatus.running ? <X size={16} /> : <Users size={16} />}
              onClick={collaborationStatus.running ? stopHelperLink : startHelperLink}
            >
              {collaborationStatus.running ? "Stop Helper Link" : "Start Helper Link"}
            </Button>
            <Button icon={<Copy size={16} />} onClick={copyHelperLink} disabled={!collaborationStatus.url}>
              Copy Helper Link
            </Button>
          </div>
          {collaborationStatus.url ? (
            <label className="collaboration-link-field">
              <span>URL</span>
              <input aria-label="Helper share link" readOnly value={collaborationStatus.url} />
            </label>
          ) : null}
          <div className="collaboration-hints">
            <div className="collaboration-hints-heading">
              <span>
                <Link2 size={14} />
                {collaborationStatus.hintCount} hints
              </span>
              {collaborationMessage ? <span>{collaborationMessage}</span> : null}
            </div>
            {collaborationHints.length > 0 ? (
              <div className="helper-hint-list">
                {collaborationHints.map((hint) => (
                  <article className="helper-hint" key={hint.id}>
                    <p>{hint.message}</p>
                    <button
                      type="button"
                      aria-label={`Dismiss helper hint ${hint.id}`}
                      onClick={() => void dismissCollaborationHint(hint.id)}
                    >
                      <X size={14} />
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="manual-transcript-form">
          <label>
            <span>Speaker</span>
            <select value={manualSpeaker} onChange={(event) => setManualSpeaker(event.currentTarget.value as Speaker)}>
              <option value="interviewer">Interviewer</option>
              <option value="candidate">You</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label>
            <span>Transcript line</span>
            <textarea
              value={manualTranscript}
              onChange={(event) => setManualTranscript(event.currentTarget.value)}
              placeholder="Paste or type what was just said in the interview..."
            />
          </label>
          <Button icon={<Send size={16} />} onClick={saveManualTranscript}>
            Save Transcript
          </Button>
        </div>

        <div className="runtime-status">
          <span>{statusMessage}</span>
          {errorMessage ? <strong>{errorMessage}</strong> : null}
        </div>
      </section>

      <AudioControls
        devices={audioDevices}
        captureStatus={captureStatus}
        status={captureStatus.running ? "Live" : config.audio.captureMode === "manual" ? "Manual" : config.audio.captureMode}
      />
      <TranscriptFeed transcripts={transcripts} interimPreviews={interimPreviews} />

      <section className="panel overlay-control-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Overlay</p>
            <h2>Stealth Window</h2>
          </div>
        </div>
        <div className="overlay-runtime">
          <span>
            <Keyboard size={14} />
            {overlayShortcutLabel(overlayShortcut)}
          </span>
          <span>
            <ShieldCheck size={14} />
            Capture {overlayProtection?.captureExclusion ?? "checking"}
          </span>
          <span>Click-through {overlayProtection?.clickThrough ? "on" : "off"}</span>
          <span>Share guard {screenShareStatus?.active ? "detected" : "clear"}</span>
        </div>
        {overlayMessage ? <p className="overlay-runtime-message">{overlayMessage}</p> : null}
        <OverlayWindow responses={responses} transcripts={transcripts} />
        <div className="control-grid">
          <label>
            <span>Opacity</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.01"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.currentTarget.value))}
            />
          </label>
          <label>
            <span>Font</span>
            <input
              type="range"
              min="12"
              max="28"
              step="1"
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.currentTarget.value))}
            />
          </label>
          <label className="toggle-row">
            <span>Lock position</span>
            <input type="checkbox" checked={locked} onChange={(event) => setLocked(event.currentTarget.checked)} />
          </label>
        </div>
      </section>

      <CodeAssistantPanel responses={responses.filter((item) => item.id !== TEMP_STREAM_ID)} />
    </main>
  );
}

function buildPromptMessages(
  config: AppConfig,
  transcripts: TranscriptSegment[],
  template: Parameters<typeof buildChatMessages>[0]["template"],
  knowledgeBase: KnowledgeBase
): ChatMessage[] {
  const selectedProvider = config.providers.find((provider) => provider.id === config.selectedProviderId) ?? config.providers[0];
  const includeOcrContext = canSendOcrContext({
    settings: config.ocr,
    reviewed: Boolean(config.ocr.lastText?.trim()),
    providerKind: selectedProvider.kind,
    localOnlyMode: config.security.localOnlyMode
  });
  const latestInterviewerQuestion = [...transcripts]
    .reverse()
    .find((segment) => segment.speaker === "interviewer" && segment.content.trim());
  const knowledgeQuery =
    latestInterviewerQuestion?.content.trim() ??
    transcripts
      .map((segment) => segment.content.trim())
      .filter(Boolean)
      .join("\n");
  const knowledgeContext = knowledgeQuery
    ? searchKnowledgeBase(knowledgeBase, knowledgeQuery, 4)
        .map((chunk) => `${chunk.sourceLabel}\n${chunk.text}`)
        .join("\n\n")
    : "";

  return buildChatMessages({
    template,
    transcripts,
    resumeContext: [config.resumeContext, config.jobDescriptionContext].filter(Boolean).join("\n\n"),
    ocrContext: includeOcrContext ? config.ocr.lastText : undefined,
    knowledgeContext: knowledgeContext || undefined,
    maxContextTokens: config.contextWindow.maxPromptTokens,
    maxStaticContextTokens: config.contextWindow.maxStaticContextTokens,
    maxHistoryTurns: config.contextWindow.maxHistoryTurns
  });
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Math.min(10000, delayMs))));
}

function isCloudBlocked(config: AppConfig): boolean {
  return config.security.localOnlyMode && config.security.blockCloudWhenLocalOnly;
}

function overlayAutoHideMessage(screenShareStatus: ScreenShareStatus | null): string {
  if (screenShareStatus?.active && screenShareStatus.matchedProcesses.length > 0) {
    return `Overlay hidden because screen sharing process is running: ${screenShareProcessNames(screenShareStatus)}.`;
  }

  if (screenShareStatus?.active) {
    return "Overlay hidden because screen-share guard could not verify that sharing is clear.";
  }

  return "Overlay hidden because capture exclusion is not enabled.";
}

function screenShareProcessNames(screenShareStatus: ScreenShareStatus): string {
  return screenShareStatus.matchedProcesses.map((process) => process.name).join(", ") || "unknown";
}

async function detectScreenShareStatusFailClosed(): Promise<ScreenShareStatus> {
  try {
    return await detectScreenShareStatus();
  } catch {
    return {
      active: true,
      matchedProcesses: [],
      message: "Screen-share guard check failed."
    };
  }
}

function buildCollaborationSnapshot(
  session: SessionRecord | null,
  transcripts: TranscriptSegment[],
  responses: AIResponseRecord[]
): CollaborationSnapshot {
  return {
    session: session
      ? {
          id: session.id,
          title: session.title,
          company: session.company?.trim() || undefined,
          role: session.role?.trim() || undefined
        }
      : undefined,
    transcripts: transcripts.slice(-80).map((segment) => ({
      speaker: segment.speaker,
      content: segment.content,
      timestampMs: segment.timestampMs
    })),
    responses: responses
      .filter((response) => response.id !== TEMP_STREAM_ID && response.response.trim())
      .slice(0, 10)
      .map((response) => ({
        response: response.response,
        model: response.model,
        provider: response.provider,
        createdAt: response.createdAt
      })),
    updatedAtMs: Date.now()
  };
}

function websocketSttEndpoint(endpoint: string): string | undefined {
  const trimmed = endpoint.trim();
  return trimmed.startsWith("ws://") || trimmed.startsWith("wss://") ? trimmed : undefined;
}

function parseSessionTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function isSnapshotSttMode(mode: AppConfig["stt"]["selectedMode"]): mode is "assemblyai" | "google" {
  return mode === "assemblyai" || mode === "google";
}
