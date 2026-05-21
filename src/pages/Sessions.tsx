import { BarChart3, Check, Copy, Download, FileJson, Pencil, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/common/Button";
import { ResponseCard } from "../components/overlay/ResponseCard";
import { calculateSessionAnalytics } from "../lib/analytics";
import { downloadSessionPdf, exportSessionJson, exportSessionMarkdown, renderPluginSessionExport } from "../lib/sessionExport";
import { filterSessionSummaries } from "../lib/sessionSearch";
import { formatDuration, formatTimestampMs } from "../lib/formatters";
import {
  PLUGIN_CATALOG_SETTING_KEY,
  createEmptyPluginCatalog,
  parsePluginCatalog,
  type PluginCatalog
} from "../lib/pluginLoader";
import {
  deleteTranscript,
  getSetting,
  listAiResponses,
  listSessions,
  listTranscriptPage,
  listTranscripts,
  updateTranscript
} from "../lib/tauri";
import type { AIResponseRecord, SessionRecord, Speaker, TranscriptCursor, TranscriptPage, TranscriptSegment } from "../types/session";

const TRANSCRIPT_PAGE_LIMIT = 100;

interface TranscriptCorrectionDraft {
  speaker: Speaker;
  content: string;
  timestampMs: string;
  confidence: string;
}

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
  const [editingTranscriptId, setEditingTranscriptId] = useState<number | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState<TranscriptCorrectionDraft | null>(null);
  const [transcriptPage, setTranscriptPage] = useState<TranscriptPage | null>(null);
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalog>(createEmptyPluginCatalog());

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
      const [savedSessions, rawPluginCatalog] = await Promise.all([
        listSessions(),
        getSetting(PLUGIN_CATALOG_SETTING_KEY)
      ]);
      if (!cancelled) {
        setSessions(savedSessions);
        setPluginCatalog(parsePluginCatalog(rawPluginCatalog));
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
        setTranscriptPage(null);
        return;
      }

      const [sessionTranscriptPage, sessionResponses] = await Promise.all([
        listTranscriptPage(selectedSession.id, { limit: TRANSCRIPT_PAGE_LIMIT }),
        listAiResponses(selectedSession.id)
      ]);

      if (!cancelled) {
        setTranscripts(sessionTranscriptPage.items);
        setTranscriptPage(sessionTranscriptPage);
        setResponses(sessionResponses);
        setEditingTranscriptId(null);
        setTranscriptDraft(null);
      }
    }

    loadSelectedSession();

    return () => {
      cancelled = true;
    };
  }, [selectedSession?.id]);

  async function copyMarkdownExport() {
    const fullTranscripts = await loadFullSelectedTranscripts();
    const exportText = selectedSession
      ? exportSessionMarkdown({ session: selectedSession, transcripts: fullTranscripts, responses })
      : markdownExport;
    await navigator.clipboard?.writeText(exportText);
    setStatus("Markdown export copied");
  }

  async function copyJsonExport() {
    const fullTranscripts = await loadFullSelectedTranscripts();
    const exportText = selectedSession
      ? exportSessionJson({ session: selectedSession, transcripts: fullTranscripts, responses })
      : jsonExport;
    await navigator.clipboard?.writeText(exportText);
    setStatus("JSON export copied");
  }

  async function savePdfExport() {
    if (!selectedSession) {
      return;
    }

    await downloadSessionPdf({ session: selectedSession, transcripts: await loadFullSelectedTranscripts(), responses });
    setStatus("PDF export saved");
  }

  async function copyPluginExport(template: PluginCatalog["exportTemplates"][number]) {
    if (!selectedSession) {
      return;
    }

    const exportText = renderPluginSessionExport(template, {
      session: selectedSession,
      transcripts: await loadFullSelectedTranscripts(),
      responses
    });
    await navigator.clipboard?.writeText(exportText);
    setStatus(`${template.name} export copied`);
  }

  async function loadFullSelectedTranscripts(): Promise<TranscriptSegment[]> {
    if (!selectedSession) {
      return [];
    }

    return listTranscripts(selectedSession.id);
  }

  async function loadTranscriptReplayPage(input: {
    cursor?: TranscriptCursor;
    direction?: "before" | "after";
  }) {
    if (!selectedSession) {
      return;
    }

    const page = await listTranscriptPage(selectedSession.id, {
      limit: TRANSCRIPT_PAGE_LIMIT,
      cursor: input.cursor,
      direction: input.direction
    });
    setTranscripts(page.items);
    setTranscriptPage(page);
    setEditingTranscriptId(null);
    setTranscriptDraft(null);
    setStatus(`Loaded transcript page with ${page.items.length} line${page.items.length === 1 ? "" : "s"}`);
  }

  function startTranscriptCorrection(segment: TranscriptSegment) {
    setEditingTranscriptId(segment.id);
    setTranscriptDraft({
      speaker: segment.speaker,
      content: segment.content,
      timestampMs: String(segment.timestampMs),
      confidence: segment.confidence === undefined ? "" : String(segment.confidence)
    });
  }

  function patchTranscriptDraft(patch: Partial<TranscriptCorrectionDraft>) {
    setTranscriptDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function saveTranscriptCorrection(segment: TranscriptSegment) {
    if (!transcriptDraft) {
      return;
    }

    const content = transcriptDraft.content.trim();
    if (!content) {
      setStatus("Transcript text cannot be empty");
      return;
    }

    const timestampMs = Math.max(0, Math.round(Number(transcriptDraft.timestampMs)));
    if (!Number.isFinite(timestampMs)) {
      setStatus("Transcript timestamp must be a number");
      return;
    }

    const confidence = readOptionalConfidence(transcriptDraft.confidence);
    if (confidence === null) {
      setStatus("Transcript confidence must be between 0 and 1");
      return;
    }

    const updated = await updateTranscript({
      id: segment.id,
      speaker: transcriptDraft.speaker,
      content,
      timestampMs,
      confidence
    });
    const corrected = { ...updated, sessionId: updated.sessionId || segment.sessionId };

    const nextTranscripts = sortTranscriptSegments(
      transcripts.map((item) => (item.id === corrected.id ? corrected : item))
    );
    setTranscripts(nextTranscripts);
    setTranscriptPage((current) => (current ? buildTranscriptPageFromCurrentItems(current, nextTranscripts) : current));
    syncTranscriptCaches(corrected.sessionId, nextTranscripts);
    setEditingTranscriptId(null);
    setTranscriptDraft(null);
    setStatus("Transcript correction saved");
  }

  async function deleteSavedTranscript(segment: TranscriptSegment) {
    await deleteTranscript(segment.id);
    const nextTranscripts = transcripts.filter((item) => item.id !== segment.id);
    setTranscripts(nextTranscripts);
    setTranscriptPage((current) =>
      current
        ? buildTranscriptPageFromCurrentItems(current, nextTranscripts, Math.max(0, current.totalCount - 1))
        : current
    );
    syncTranscriptCaches(segment.sessionId, nextTranscripts);
    if (editingTranscriptId === segment.id) {
      setEditingTranscriptId(null);
      setTranscriptDraft(null);
    }
    setStatus("Transcript line deleted");
  }

  function syncTranscriptCaches(sessionId: string, nextTranscripts: TranscriptSegment[]) {
    setTranscriptsBySession((current) => ({
      ...current,
      [sessionId]: nextTranscripts.map((segment) => segment.content)
    }));
    setAnalyticsTranscripts((current) => [
      ...current.filter((segment) => segment.sessionId !== sessionId),
      ...nextTranscripts
    ]);
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
            <div className="transcript-pagination">
              <p>{transcriptPageSummary(transcriptPage, transcripts.length)}</p>
              <div className="button-row">
                <Button
                  aria-label="Previous transcript page"
                  disabled={!transcriptPage?.hasMoreBefore || !transcriptPage.previousCursor}
                  onClick={() =>
                    void loadTranscriptReplayPage({
                      cursor: transcriptPage?.previousCursor,
                      direction: "before"
                    })
                  }
                >
                  Previous
                </Button>
                <Button
                  aria-label="Next transcript page"
                  disabled={!transcriptPage?.hasMoreAfter || !transcriptPage.nextCursor}
                  onClick={() =>
                    void loadTranscriptReplayPage({
                      cursor: transcriptPage?.nextCursor,
                      direction: "after"
                    })
                  }
                >
                  Next
                </Button>
              </div>
            </div>
            <div className="transcript-feed">
              {transcripts.length > 0 ? (
                transcripts.map((segment) => (
                  <article className={`transcript-row speaker-${segment.speaker}`} key={segment.id}>
                    {editingTranscriptId === segment.id && transcriptDraft ? (
                      <div className="transcript-editor">
                        <div className="transcript-editor-grid">
                          <label className="settings-field">
                            <span>Speaker for transcript line {segment.id}</span>
                            <select
                              value={transcriptDraft.speaker}
                              onChange={(event) =>
                                patchTranscriptDraft({ speaker: event.currentTarget.value as Speaker })
                              }
                            >
                              <option value="interviewer">Interviewer</option>
                              <option value="candidate">Candidate</option>
                              <option value="unknown">Unknown</option>
                            </select>
                          </label>
                          <label className="settings-field">
                            <span>Timestamp ms for transcript line {segment.id}</span>
                            <input
                              type="number"
                              min="0"
                              value={transcriptDraft.timestampMs}
                              onChange={(event) => patchTranscriptDraft({ timestampMs: event.currentTarget.value })}
                            />
                          </label>
                          <label className="settings-field">
                            <span>Confidence for transcript line {segment.id}</span>
                            <input
                              type="number"
                              min="0"
                              max="1"
                              step="0.01"
                              value={transcriptDraft.confidence}
                              onChange={(event) => patchTranscriptDraft({ confidence: event.currentTarget.value })}
                            />
                          </label>
                        </div>
                        <label className="settings-field">
                          <span>Transcript text for line {segment.id}</span>
                          <textarea
                            value={transcriptDraft.content}
                            onChange={(event) => patchTranscriptDraft({ content: event.currentTarget.value })}
                          />
                        </label>
                        <div className="button-row transcript-row-actions">
                          <Button
                            aria-label={`Save transcript line ${segment.id}`}
                            icon={<Check size={16} />}
                            variant="primary"
                            onClick={() => void saveTranscriptCorrection(segment)}
                          >
                            Save
                          </Button>
                          <Button
                            aria-label={`Cancel transcript line ${segment.id}`}
                            icon={<X size={16} />}
                            onClick={() => {
                              setEditingTranscriptId(null);
                              setTranscriptDraft(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="transcript-meta">
                          <span>{segment.speaker}</span>
                          <span>{formatTimestampMs(segment.timestampMs)}</span>
                        </div>
                        <p>{segment.content}</p>
                        <div className="button-row transcript-row-actions">
                          <Button
                            aria-label={`Edit transcript line ${segment.id}`}
                            icon={<Pencil size={16} />}
                            onClick={() => startTranscriptCorrection(segment)}
                          >
                            Edit
                          </Button>
                          <Button
                            aria-label={`Delete transcript line ${segment.id}`}
                            icon={<Trash2 size={16} />}
                            variant="danger"
                            onClick={() => void deleteSavedTranscript(segment)}
                          >
                            Delete
                          </Button>
                        </div>
                      </>
                    )}
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
            {pluginCatalog.exportTemplates.map((template) => (
              <Button
                key={template.id}
                icon={<Copy size={16} />}
                onClick={() => void copyPluginExport(template)}
                disabled={!selectedSession}
              >
                Copy {template.name}
              </Button>
            ))}
          </div>
        </div>
        <pre>{markdownExport}</pre>
      </section>
    </main>
  );
}

function sortTranscriptSegments(transcripts: TranscriptSegment[]): TranscriptSegment[] {
  return [...transcripts].sort((left, right) => left.timestampMs - right.timestampMs || left.id - right.id);
}

function buildTranscriptPageFromCurrentItems(
  current: TranscriptPage,
  items: TranscriptSegment[],
  totalCount = current.totalCount
): TranscriptPage {
  return {
    ...current,
    items,
    totalCount,
    previousCursor: transcriptCursorFor(items[0]),
    nextCursor: transcriptCursorFor(items[items.length - 1])
  };
}

function transcriptCursorFor(segment: TranscriptSegment | undefined): TranscriptCursor | undefined {
  return segment ? { timestampMs: segment.timestampMs, id: segment.id } : undefined;
}

function transcriptPageSummary(page: TranscriptPage | null, visibleCount: number): string {
  if (!page) {
    return "No transcript page loaded";
  }

  const lineLabel = visibleCount === 1 ? "transcript line" : "transcript lines";
  return `Showing ${visibleCount} ${lineLabel} of ${page.totalCount}`;
}

function readOptionalConfidence(value: string): number | undefined | null {
  if (!value.trim()) {
    return undefined;
  }

  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return null;
  }

  return confidence;
}
