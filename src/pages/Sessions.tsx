import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/common/Button";
import { exportSessionMarkdown } from "../lib/sessionExport";
import { formatDuration } from "../lib/formatters";
import { listAiResponses, listSessions, listTranscripts } from "../lib/tauri";
import type { AIResponseRecord, SessionRecord, TranscriptSegment } from "../types/session";

export function Sessions() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [responses, setResponses] = useState<AIResponseRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading sessions...");

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const filteredSessions = sessions.filter((session) =>
    [session.title, session.company, session.role, session.tags.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const markdownExport = useMemo(() => {
    if (!selectedSession) {
      return "No saved session selected yet.";
    }

    return exportSessionMarkdown({
      session: selectedSession,
      transcripts,
      responses
    });
  }, [responses, selectedSession, transcripts]);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      const savedSessions = await listSessions();
      if (!cancelled) {
        setSessions(savedSessions);
        setSelectedSessionId(savedSessions[0]?.id ?? null);
        setStatus(savedSessions.length > 0 ? `${savedSessions.length} saved sessions` : "No saved sessions yet");
      }
    }

    loadSessions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedSession() {
      if (!selectedSession) {
        setTranscripts([]);
        setResponses([]);
        return;
      }

      const [sessionTranscripts, sessionResponses] = await Promise.all([
        listTranscripts(selectedSession.id),
        listAiResponses(selectedSession.id)
      ]);

      if (!cancelled) {
        setTranscripts(sessionTranscripts);
        setResponses(sessionResponses);
      }
    }

    loadSelectedSession();

    return () => {
      cancelled = true;
    };
  }, [selectedSession?.id]);

  async function copyExport() {
    await navigator.clipboard?.writeText(markdownExport);
    setStatus("Markdown export copied");
  }

  return (
    <main className="page-column">
      <section className="panel toolbar-panel">
        <div>
          <p className="eyebrow">Archive</p>
          <h1>Sessions</h1>
          <p className="page-status">{status}</p>
        </div>
        <div className="search-box">
          <Search size={16} />
          <input
            aria-label="Search sessions"
            placeholder="Search company, role, tag"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
      </section>

      <section className="session-list" aria-label="Session history">
        {filteredSessions.length > 0 ? (
          filteredSessions.map((session) => (
            <button
              className={`session-row session-row-button ${selectedSession?.id === session.id ? "selected" : ""}`}
              key={session.id}
              onClick={() => setSelectedSessionId(session.id)}
            >
              <div>
                <h2>{session.title}</h2>
                <p>
                  {[session.company, session.role].filter(Boolean).join(" - ") || "Personal practice session"}
                </p>
              </div>
              <div className="tag-list">
                {session.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="session-stats">
                <span>{session.status}</span>
                <strong>{formatDuration(session.durationSeconds)}</strong>
              </div>
            </button>
          ))
        ) : (
          <p className="empty-copy">Real sessions appear here after you use the Dashboard and save transcript lines.</p>
        )}
      </section>

      <section className="panel export-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Export</p>
            <h2>Markdown Preview</h2>
          </div>
          <Button icon={<Download size={16} />} onClick={copyExport} disabled={!selectedSession}>
            Copy Export
          </Button>
        </div>
        <pre>{markdownExport}</pre>
      </section>
    </main>
  );
}
