import { Download, Search } from "lucide-react";
import { Button } from "../components/common/Button";
import { aiResponses, historicalSessions, transcriptSegments } from "../lib/demoData";
import { exportSessionMarkdown } from "../lib/sessionExport";
import { formatDuration } from "../lib/formatters";

export function Sessions() {
  const latestExport = exportSessionMarkdown({
    session: historicalSessions[0],
    transcripts: transcriptSegments,
    responses: aiResponses
  });

  return (
    <main className="page-column">
      <section className="panel toolbar-panel">
        <div>
          <p className="eyebrow">Archive</p>
          <h1>Sessions</h1>
        </div>
        <div className="search-box">
          <Search size={16} />
          <input aria-label="Search sessions" placeholder="Search company, role, tag" />
        </div>
      </section>

      <section className="session-list" aria-label="Session history">
        {historicalSessions.map((session) => (
          <article className="session-row" key={session.id}>
            <div>
              <h2>{session.title}</h2>
              <p>
                {session.company} · {session.role}
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
          </article>
        ))}
      </section>

      <section className="panel export-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Export</p>
            <h2>Markdown Preview</h2>
          </div>
          <Button icon={<Download size={16} />}>Export</Button>
        </div>
        <pre>{latestExport}</pre>
      </section>
    </main>
  );
}

