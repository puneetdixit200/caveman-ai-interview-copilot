import { useEffect, useState } from "react";
import { selectOverlaySession, sortOverlayResponses } from "../../lib/overlayData";
import { listAiResponses, listSessions, listTranscripts } from "../../lib/tauri";
import type { AIResponseRecord, TranscriptSegment } from "../../types/session";
import { OverlayWindow } from "./OverlayWindow";

const OVERLAY_REFRESH_MS = 1200;

export function LiveOverlayRoot() {
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [responses, setResponses] = useState<AIResponseRecord[]>([]);

  useEffect(() => {
    let disposed = false;

    async function refreshOverlayData() {
      const session = selectOverlaySession(await listSessions());
      if (!session) {
        if (!disposed) {
          setTranscripts([]);
          setResponses([]);
        }
        return;
      }

      const [nextTranscripts, nextResponses] = await Promise.all([
        listTranscripts(session.id),
        listAiResponses(session.id)
      ]);

      if (!disposed) {
        setTranscripts(nextTranscripts);
        setResponses(sortOverlayResponses(nextResponses));
      }
    }

    void refreshOverlayData();
    const interval = window.setInterval(() => void refreshOverlayData(), OVERLAY_REFRESH_MS);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  return <OverlayWindow responses={responses} transcripts={transcripts} />;
}
