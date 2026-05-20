import { Eye, EyeOff, Play, Send, Square, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AudioControls } from "../components/audio/AudioControls";
import { Button } from "../components/common/Button";
import { OverlayWindow } from "../components/overlay/OverlayWindow";
import { TranscriptFeed } from "../components/overlay/TranscriptFeed";
import { APP_CONFIG_SETTING_KEY, DEFAULT_APP_CONFIG, parseAppConfig } from "../lib/appConfig";
import { buildChatMessages } from "../lib/contextBuilder";
import { createConfiguredProvider } from "../lib/providerClients";
import { promptTemplates } from "../lib/promptTemplates";
import { estimateTokens, nextTranscriptTimestampMs } from "../lib/sessionRuntime";
import {
  addAiResponse,
  addTranscript,
  createSession,
  getSetting,
  listAiResponses,
  listSessions,
  listTranscripts
} from "../lib/tauri";
import { ProviderRouter } from "../lib/providerRouter";
import { useOverlayStore } from "../stores/overlayStore";
import type { AIResponseRecord, ChatMessage, SessionRecord, Speaker, TranscriptSegment } from "../types/session";
import type { AppConfig } from "../lib/appConfig";

const TEMP_STREAM_ID = -1;

export function Dashboard() {
  const [running, setRunning] = useState(true);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [responses, setResponses] = useState<AIResponseRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [manualSpeaker, setManualSpeaker] = useState<Speaker>("interviewer");
  const [manualTranscript, setManualTranscript] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Loading session...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { visible, toggleVisible, opacity, setOpacity, fontSize, setFontSize, locked, setLocked } = useOverlayStore();

  const selectedProvider = useMemo(
    () => config.providers.find((provider) => provider.id === config.selectedProviderId) ?? config.providers[0],
    [config.providers, config.selectedProviderId]
  );

  const template = useMemo(
    () => promptTemplates.find((item) => item.category === session?.interviewType) ?? promptTemplates[0],
    [session?.interviewType]
  );

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
        const storedConfig = parseAppConfig(await getSetting(APP_CONFIG_SETTING_KEY));
        const sessions = await listSessions();
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

        setConfig(storedConfig);
        setSession(activeSession);
        await refreshSessionData(activeSession.id);
        setStatusMessage(`Ready with ${storedConfig.selectedProviderId}`);
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
    setTranscripts((current) => [...current, saved]);
    setManualTranscript("");
    setStatusMessage("Transcript saved");
  }

  async function generateResponse() {
    if (!session) {
      setErrorMessage("Session is still loading.");
      return;
    }

    if (transcripts.length === 0) {
      setErrorMessage("Add at least one transcript line before generating an answer.");
      return;
    }

    const providers = orderedEnabledProviders(config).map((provider) => createConfiguredProvider(provider));
    if (providers.length === 0) {
      setErrorMessage("Enable at least one provider in Settings.");
      return;
    }

    setStreaming(true);
    setErrorMessage(null);
    setStatusMessage(`Streaming from ${providers[0].label}...`);

    const messages = buildPromptMessages(config, transcripts, template);
    const router = new ProviderRouter(providers);
    const startedAt = performance.now();
    let response = "";

    try {
      for await (const chunk of router.chatStream({ messages, model: selectedProvider.model })) {
        response += chunk;
        setResponses((current) => [
          {
            id: TEMP_STREAM_ID,
            sessionId: session.id,
            provider: providers[0].id,
            model: selectedProvider.model,
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
        promptMessages: JSON.stringify(messages),
        response,
        model: selectedProvider.model,
        provider: providers[0].id,
        inputTokens: estimateTokens(messages.map((message) => message.content).join("\n")),
        outputTokens: estimateTokens(response),
        latencyMs: Math.round(performance.now() - startedAt)
      });

      setResponses((current) => [saved, ...current.filter((item) => item.id !== TEMP_STREAM_ID)]);
      setStatusMessage("AI response saved to this session");
    } catch (error) {
      setResponses((current) => current.filter((item) => item.id !== TEMP_STREAM_ID));
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatusMessage("Provider request failed");
    } finally {
      setStreaming(false);
    }
  }

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
            onClick={() => setRunning((value) => !value)}
          >
            {running ? "Stop" : "Start"}
          </Button>
          <Button icon={visible ? <EyeOff size={16} /> : <Eye size={16} />} onClick={toggleVisible}>
            {visible ? "Hide Overlay" : "Show Overlay"}
          </Button>
          <Button variant="primary" icon={<Wand2 size={16} />} onClick={generateResponse} disabled={streaming}>
            {streaming ? "Streaming" : "Generate"}
          </Button>
        </div>

        <div className="metric-strip">
          <div>
            <span>Mode</span>
            <strong>manual transcript</strong>
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

      <AudioControls devices={[]} status="Manual" />
      <TranscriptFeed transcripts={transcripts} />

      <section className="panel overlay-control-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Overlay</p>
            <h2>Stealth Window</h2>
          </div>
        </div>
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
    </main>
  );
}

function buildPromptMessages(
  config: AppConfig,
  transcripts: TranscriptSegment[],
  template: Parameters<typeof buildChatMessages>[0]["template"]
): ChatMessage[] {
  return buildChatMessages({
    template,
    transcripts,
    resumeContext: [config.resumeContext, config.jobDescriptionContext].filter(Boolean).join("\n\n")
  });
}

function orderedEnabledProviders(config: AppConfig) {
  const enabled = config.providers.filter((provider) => provider.enabled);
  return enabled.sort((left, right) => {
    if (left.id === config.selectedProviderId) {
      return -1;
    }

    if (right.id === config.selectedProviderId) {
      return 1;
    }

    return 0;
  });
}
