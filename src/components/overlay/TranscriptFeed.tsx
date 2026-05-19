import type { TranscriptSegment } from "../../types/session";
import { formatConfidence, formatTimestampMs } from "../../lib/formatters";

interface TranscriptFeedProps {
  transcripts: TranscriptSegment[];
}

export function TranscriptFeed({ transcripts }: TranscriptFeedProps) {
  return (
    <section className="panel transcript-panel" aria-label="Live transcript">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Transcript</p>
          <h2>Live Conversation</h2>
        </div>
      </div>
      <div className="transcript-feed">
        {transcripts.map((segment) => (
          <article className={`transcript-row speaker-${segment.speaker}`} key={segment.id}>
            <div className="transcript-meta">
              <span>{formatTimestampMs(segment.timestampMs)}</span>
              <strong>{segment.speaker}</strong>
              <span>{formatConfidence(segment.confidence)}</span>
            </div>
            <p>{segment.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

