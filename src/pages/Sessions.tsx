import { BarChart3, Copy, Download, FileJson, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/common/Button";
import { ResponseCard } from "../components/overlay/ResponseCard";
import { calculateSessionAnalytics } from "../lib/analytics";
import { downloadSessionPdf, exportSessionJson, exportSessionMarkdown } from "../lib/sessionExport";
import { filterSessionSummaries } from "../lib/sessionSearch";
import { formatDuration, formatTimestampMs } from "../lib/formatters";
import { listAiResponses, listSessions, listTranscripts } from "../lib/tauri";
import type { AIResponseRecord, SessionRecord, TranscriptSegment } from "../types/session";

export function Sessions() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [responses, setResponses] = useState<AIResponseRecord[]>([]);
  const [analyticsTranscripts, setAnalyticsTranscripts] = useState<TranscriptSegment[]>([]);
  const [analyticsResponses, setAnalyticsResponses] = useState<AIResponseRecord[]>([]);
  const [transcriptsBySession, setTranscriptsBySession] = useState<Record<string, string[]>>({});
  const [responsesBySession, setResponsesBySession] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading sessions...");

  const filteredSessions = useMemo(
    () => filterSessionSummaries({ query, sessions, transcriptsBySession, responsesBySession }),
    [query, responsesBySession, sessions, transcriptsBySession]
  );
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? filteredSessions[0] ?? sessions[0];
  const analytics = useMemo(
    () =>
      calculateSessionAnalytics({
        sessions,
        transcripts: analyticsTranscripts,
        responses: analyticsResponses
      }),
    [analyticsResponses, analyticsTranscripts, sessions]
  );
  const topProvider = useMemo(
    () =>
      Object.entries(analytics.providerCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "none",
    [analytics.providerCounts]
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

  const jsonExport = useMemo(() => {
    if (!selectedSession) {
      return "{}";
    }

    return exportSessionJson({
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

    async function buildSearchIndex() {
      const transcriptCollections = await Promise.all(
        sessions.map(async (session) => ({
          sessionId: session.id,
          items: await listTranscripts(session.id)
        }))
      );
      const responseCollections = await Promise.all(
        sessions.map(async (session) => ({
          sessionId: session.id,
          items: await listAiResponses(session.id)
        }))
      );

      if (!cancelled) {
        setTranscriptsBySession(
          Object.fromEntries(
            transcriptCollections.map((entry) => [entry.sessionId, entry.items.map((transcript) => transcript.content)])
          )
        );
        setResponsesBySession(
          Object.fromEntries(
            responseCollections.map((entry) => [entry.sessionId, entry.items.map((response) => response.response)])
          )
        );
        setAnalyticsTranscripts(transcriptCollections.flatMap((entry) => entry.items));
        setAnalyticsResponses(responseCollections.flatMap((entry) => entry.items));
      }
    }

    if (sessions.length > 0) {
      void buildSearchIndex();
    }

    return () => {
      cancelled = true;
    };
  }, [sessions]);

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

  async function copyMarkdownExport() {
    await navigator.clipboard?.writeText(markdownExport);
    setStatus("Markdown export copied");
  }

  async function copyJsonExport() {
    await navigator.clipboard?.writeText(jsonExport);
    setStatus("JSON export copied");
  }

  async function savePdfExport() {
    if (!selectedSession) {
      return;
    }

    await downloadSessionPdf({ session: selectedSession, transcripts, responses });
    setStatus("PDF export saved");
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
            placeholder="Search sessions, transcript, answers"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
      </section>

      <section className="panel analytics-panel" aria-label="Session analytics">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Performance</p>
            <h2>Analytics</h2>
          </div>
          <BarChart3 size={18} />
        </div>
        <div className="metric-strip">
          <div>
            <span>Sessions</span>
            <strong>
              {analytics.totalSessions} session{analytics.totalSessions === 1 ? "" : "s"}
            </strong>
          </div>
          <div>
            <span>Questions</span>
            <strong>
              {analytics.totalQuestions} question{analytics.totalQuestions === 1 ? "" : "s"}
            </strong>
          </div>
          <div>
            <span>Latency</span>
            <strong>{analytics.averageLatencyMs}ms avg latency</strong>
          </div>
          <div>
            <span>Top provider</span>
            <strong>{topProvider}</strong>
          </div>
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
                <small>
                  {(transcriptsBySession[session.id]?.length ?? 0) +
                    (responsesBySession[session.id]?.length ?? 0)}{" "}
                  replay items
                </small>
              </div>
            </button>
          ))
        ) : (
          <p className="empty-copy">Real sessions appear here after you use the Dashboard and save transcript lines.</p>
        )}
      </section>

      <section className="panel replay-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Replay</p>
            <h2>{selectedSession?.title ?? "No session selected"}</h2>
          </div>
        </div>
        <div className="replay-grid">
          <div className="replay-column">
            <h3>Transcript</h3>
            <div className="transcript-feed">
              {transcripts.length > 0 ? (
                transcripts.map((segment) => (
                  <article className={`transcript-row speaker-${segment.speaker}`} key={segment.id}>
                    <div className="transcript-meta">
                      <span>{segment.speaker}</span>
                      <span>{formatTimestampMs(segment.timestampMs)}</span>
                    </div>
                    <p>{segment.content}</p>
                  </article>
                ))
              ) : (
                <p className="empty-copy">No transcript lines saved for this session.</p>
              )}
            </div>
          </div>
          <div className="replay-column">
            <h3>Answers</h3>
            <div className="overlay-responses">
              {responses.length > 0 ? (
                responses.map((response) => <ResponseCard key={response.id} response={response} />)
              ) : (
                <p className="empty-copy">No AI responses saved for this session.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="panel export-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Export</p>
            <h2>Markdown Preview</h2>
          </div>
          <div className="button-row">
            <Button icon={<Copy size={16} />} onClick={copyMarkdownExport} disabled={!selectedSession}>
              Copy Markdown
            </Button>
            <Button icon={<FileJson size={16} />} onClick={copyJsonExport} disabled={!selectedSession}>
              Copy JSON
            </Button>
            <Button icon={<Download size={16} />} onClick={savePdfExport} disabled={!selectedSession}>
              Save PDF
            </Button>
          </div>
        </div>
        <pre>{markdownExport}</pre>
      </section>
    </main>
  );
}
