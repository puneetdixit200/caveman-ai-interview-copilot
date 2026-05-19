import { EyeOff, LockKeyhole, UnlockKeyhole } from "lucide-react";
import { useOverlayStore } from "../../stores/overlayStore";
import type { AIResponseRecord, TranscriptSegment } from "../../types/session";
import { ResponseCard } from "./ResponseCard";

interface OverlayWindowProps {
  responses: AIResponseRecord[];
  transcripts: TranscriptSegment[];
}

export function OverlayWindow({ responses, transcripts }: OverlayWindowProps) {
  const { visible, opacity, fontSize, locked } = useOverlayStore();
  const latestQuestion = [...transcripts].reverse().find((segment) => segment.speaker === "interviewer");

  if (!visible) {
    return (
      <div className="overlay-hidden">
        <EyeOff size={18} />
        <span>Hidden</span>
      </div>
    );
  }

  return (
    <section
      className="overlay-surface"
      style={{
        opacity,
        fontSize
      }}
      aria-label="Stealth overlay preview"
    >
      <header className="overlay-header">
        <div>
          <span className="status-dot" />
          <strong>Caveman Overlay</strong>
        </div>
        {locked ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}
      </header>

      {latestQuestion ? <p className="overlay-question">{latestQuestion.content}</p> : null}

      <div className="overlay-responses">
        {responses.map((response) => (
          <ResponseCard key={response.id} response={response} />
        ))}
      </div>
    </section>
  );
}

