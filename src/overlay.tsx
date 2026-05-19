import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OverlayWindow } from "./components/overlay/OverlayWindow";
import { aiResponses, transcriptSegments } from "./lib/demoData";
import "./index.css";

createRoot(document.getElementById("overlay-root") as HTMLElement).render(
  <StrictMode>
    <div className="overlay-entry">
      <OverlayWindow responses={aiResponses} transcripts={transcriptSegments} />
    </div>
  </StrictMode>
);

