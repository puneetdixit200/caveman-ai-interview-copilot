import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LiveOverlayRoot } from "./components/overlay/LiveOverlayRoot";
import "./index.css";

createRoot(document.getElementById("overlay-root") as HTMLElement).render(
  <StrictMode>
    <div className="overlay-entry">
      <LiveOverlayRoot />
    </div>
  </StrictMode>
);
