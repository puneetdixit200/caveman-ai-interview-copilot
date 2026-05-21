import type { TranscriptSegment } from "../../types/session";
import { formatConfidence, formatTimestampMs } from "../../lib/formatters";

export interface InterimTranscriptPreview {
  id: string;
  speaker: TranscriptSegment["speaker"];
  content: string;
  timestampMs: number;
  confidence?: number;
  source: "microphone" | "system";
}

interface TranscriptFeedProps {
  transcripts: TranscriptSegment[];
  interimPreviews?: InterimTranscriptPreview[];
}

export function TranscriptFeed({ transcripts, interimPreviews = [] }: TranscriptFeedProps) {
  return (
    <section className="panel transcript-panel" aria-label="Live transcript">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Transcript</p>
          <h2>Live Conversation</h2>
        </div>
      </div>
      <div className="transcript-feed">
        {interimPreviews.map((preview) => (
          <article className={`transcript-row transcript-row-interim speaker-${preview.speaker}`} key={preview.id}>
            <div className="transcript-meta">
              <span>{formatTimestampMs(preview.timestampMs)}</span>
              <strong>{preview.speaker}</strong>
              <span>{formatConfidence(preview.confidence)}</span>
              <span>live</span>
              <span>{preview.source}</span>
            </div>
            <p>{preview.content}</p>
          </article>
        ))}
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
