import { Eye, EyeOff, Keyboard, Play, Send, ShieldCheck, Square, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioControls } from "../components/audio/AudioControls";
import { CodeAssistantPanel } from "../components/code/CodeAssistantPanel";
import { Button } from "../components/common/Button";
import { OverlayWindow } from "../components/overlay/OverlayWindow";
import { TranscriptFeed } from "../components/overlay/TranscriptFeed";
import { APP_CONFIG_SETTING_KEY, DEFAULT_APP_CONFIG, parseAppConfig } from "../lib/appConfig";
import { applyAudioLevelEvent, type AudioCaptureState } from "../lib/audioEvents";
import { shouldTriggerAnswer } from "../lib/autoTrigger";
import { buildChatMessages } from "../lib/contextBuilder";
import { canSendOcrContext } from "../lib/ocr";
import { registerGlobalActionShortcuts } from "../lib/globalHotkeys";
import { DEFAULT_OVERLAY_SHORTCUT, overlayShortcutLabel } from "../lib/hotkeys";
import { shouldAutoHideOverlay } from "../lib/overlaySafety";
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
import { enqueueTtsResponse, playTtsItem } from "../lib/tts";
import { runLiveTranscriptionPass } from "../lib/liveTranscription";
import {
  addAiResponse,
  addTranscript,
  createSession,
  getCaptureStatus,
  getSetting,
  isRunningInTauri,
  listAudioDevices,
  listAiResponses,
  listSessions,
  listTranscripts,
  onAudioLevel,
  protectOverlayWindow,
  setOverlayWindowBounds,
  setOverlayWindowVisible,
  startCapture,
  stopCapture,
  typeTextIntoActiveWindow
} from "../lib/tauri";
import { ProviderRouter } from "../lib/providerRouter";
import { useOverlayStore } from "../stores/overlayStore";
import type { AIResponseRecord, ChatMessage, SessionRecord, Speaker, TranscriptSegment } from "../types/session";
import type { AudioDevice } from "../types/settings";
import type { AppConfig } from "../lib/appConfig";
import type { OverlayProtectionStatus } from "../lib/tauri";

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

export function Dashboard() {
  const [running, setRunning] = useState(false);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [responses, setResponses] = useState<AIResponseRecord[]>([]);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [captureStatus, setCaptureStatus] = useState<AudioCaptureState>(DEFAULT_CAPTURE_STATUS);
  const [overlayProtection, setOverlayProtection] = useState<OverlayProtectionStatus | null>(null);
  const [overlayShortcut, setOverlayShortcut] = useState(DEFAULT_OVERLAY_SHORTCUT);
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [manualSpeaker, setManualSpeaker] = useState<Speaker>("interviewer");
  const [manualTranscript, setManualTranscript] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [lastTriggeredTranscriptId, setLastTriggeredTranscriptId] = useState<number | undefined>();
  const [statusMessage, setStatusMessage] = useState("Loading session...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase>(createKnowledgeBase());
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalog>(createEmptyPluginCatalog());
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
        await setOverlayWindowBounds(config.overlay.bounds);
      }
      setVisible(nextVisible);
      const status = await setOverlayWindowVisible(nextVisible);
      if (
        nextVisible &&
        shouldAutoHideOverlay({
          autoHideOnScreenShare: config.overlay.autoHideOnScreenShare,
          captureExclusion: status.captureExclusion
        })
      ) {
        const hiddenStatus = await setOverlayWindowVisible(false);
        setOverlayProtection(hiddenStatus);
        setOverlayMessage("Overlay hidden because capture exclusion is not enabled.");
        setVisible(false);
        return;
      }

      setOverlayProtection(status);
      setOverlayMessage(status.message ?? (nextVisible ? "Overlay shown" : "Overlay hidden"));

      if (isRunningInTauri() && status.visible !== nextVisible) {
        setVisible(status.visible);
      }
    },
    [config.overlay.autoHideOnScreenShare, config.overlay.bounds, setVisible]
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
        const [sessions, devices, status] = await Promise.all([listSessions(), listAudioDevices(), getCaptureStatus()]);
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
        await setOverlayWindowBounds(hydratedConfig.overlay.bounds);
        setKnowledgeBase(parseKnowledgeBase(rawKnowledgeBase));
        setPluginCatalog(parsePluginCatalog(rawPluginCatalog));
        setAudioDevices(devices);
        setCaptureStatus(status);
        setRunning(status.running);
        setSession(activeSession);
        await refreshSessionData(activeSession.id);
        setStatusMessage(`Ready with ${hydratedConfig.selectedProviderId}`);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setStatusMessage("Could not load session");
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
    let cancelled = false;

    protectOverlayWindow().then(async (status) => {
      if (cancelled) {
        return;
      }

      if (
        shouldAutoHideOverlay({
          autoHideOnScreenShare: config.overlay.autoHideOnScreenShare,
          captureExclusion: status.captureExclusion
        })
      ) {
        const hiddenStatus = await setOverlayWindowVisible(false);
        if (!cancelled) {
          setOverlayProtection(hiddenStatus);
          setOverlayMessage("Overlay hidden because capture exclusion is not enabled.");
          setVisible(false);
        }
        return;
      }

      setOverlayProtection(status);
      setOverlayMessage(status.message ?? null);
      if (isRunningInTauri()) {
        setVisible(status.visible);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [config.overlay.autoHideOnScreenShare, setVisible]);

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
  }, [session?.id]);

  useEffect(() => {
    if (!running || !session || config.stt.selectedMode === "manual") {
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

  async function toggleCapture() {
    if (running) {
      const stopped = await stopCapture();
      setCaptureStatus(stopped);
      setRunning(false);
      setAudioDevices((current) => current.map((device) => ({ ...device, level: 0 })));
      setStatusMessage("Audio capture stopped");
      return;
    }

    try {
      const started = await startCapture({
        systemDeviceId: config.audio.systemDeviceId,
        microphoneDeviceId: config.audio.microphoneDeviceId,
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
      confidence: 1
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
    const providers = runnableProviderConfigs.map((provider) => createConfiguredProvider(provider));
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
      for await (const chunk of router.chatStream({ messages, model: activeModel })) {
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
      const ttsQueue = config.tts.autoPlay ? enqueueTtsResponse([], response, config.tts, visible) : [];
      const played = ttsQueue[0] ? playTtsItem(ttsQueue[0]) : false;
      setStatusMessage(played ? "AI response saved and spoken" : "AI response saved to this session");
    } catch (error) {
      setResponses((current) => current.filter((item) => item.id !== TEMP_STREAM_ID));
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatusMessage("Provider request failed");
    } finally {
      setStreaming(false);
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
        status={captureStatus.running ? "Live" : config.audio.captureMode === "manual" ? "Manual" : config.audio.captureMode}
      />
      <TranscriptFeed transcripts={transcripts} />

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
    knowledgeContext: knowledgeContext || undefined
  });
}
