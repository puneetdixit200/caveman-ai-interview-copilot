import { Eye, EyeOff, Play, Square, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AudioControls } from "../components/audio/AudioControls";
import { Button } from "../components/common/Button";
import { OverlayWindow } from "../components/overlay/OverlayWindow";
import { TranscriptFeed } from "../components/overlay/TranscriptFeed";
import { aiResponses, audioDevices, transcriptSegments } from "../lib/demoData";
import { buildChatMessages } from "../lib/contextBuilder";
import { getPromptTemplate } from "../lib/promptTemplates";
import { createDemoProvider, ProviderRouter } from "../lib/providerRouter";
import { useOverlayStore } from "../stores/overlayStore";
import type { AIResponseRecord } from "../types/session";

export function Dashboard() {
  const [running, setRunning] = useState(true);
  const [responses, setResponses] = useState<AIResponseRecord[]>(aiResponses);
  const [streaming, setStreaming] = useState(false);
  const { visible, toggleVisible, opacity, setOpacity, fontSize, setFontSize, locked, setLocked } = useOverlayStore();

  const promptMessages = useMemo(
    () =>
      buildChatMessages({
        template: getPromptTemplate("system-design"),
        transcripts: transcriptSegments,
        resumeContext: "Candidate has backend, React, and distributed systems project experience."
      }),
    []
  );

  async function generateDemoResponse() {
    setStreaming(true);
    const router = new ProviderRouter([createDemoProvider()]);
    let response = "";

    for await (const chunk of router.chatStream({ messages: promptMessages })) {
      response += chunk;
      setResponses((current) => [
        {
          id: 999,
          sessionId: "session-active",
          provider: "demo-local",
          model: "coach-preview",
          response,
          latencyMs: 18,
          createdAt: new Date().toISOString()
        },
        ...current.filter((item) => item.id !== 999)
      ]);
    }

    setStreaming(false);
  }

  return (
    <main className="dashboard-grid">
      <section className="panel command-panel">
        <div className="session-title">
          <p className="eyebrow">Active Session</p>
          <h1>Senior Backend Mock Interview</h1>
          <span className={`status-pill ${running ? "status-live" : "status-muted"}`}>
            {running ? "Listening" : "Paused"}
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
          <Button variant="primary" icon={<Wand2 size={16} />} onClick={generateDemoResponse} disabled={streaming}>
            {streaming ? "Streaming" : "Generate"}
          </Button>
        </div>

        <div className="metric-strip">
          <div>
            <span>STT</span>
            <strong>local whisper</strong>
          </div>
          <div>
            <span>LLM</span>
            <strong>ollama fallback</strong>
          </div>
          <div>
            <span>First token</span>
            <strong>820ms</strong>
          </div>
          <div>
            <span>Context</span>
            <strong>{promptMessages.length} messages</strong>
          </div>
        </div>
      </section>

      <AudioControls devices={audioDevices} />
      <TranscriptFeed transcripts={transcriptSegments} />

      <section className="panel overlay-control-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Overlay</p>
            <h2>Stealth Window</h2>
          </div>
        </div>
        <OverlayWindow responses={responses} transcripts={transcriptSegments} />
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

