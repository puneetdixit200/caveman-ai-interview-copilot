import { Mic, MonitorSpeaker, RadioTower } from "lucide-react";
import type { AudioDevice } from "../../types/settings";

interface AudioControlsProps {
  devices: AudioDevice[];
  status?: string;
}

export function AudioControls({ devices, status = "Armed" }: AudioControlsProps) {
  return (
    <section className="panel audio-panel" aria-label="Audio capture">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Audio</p>
          <h2>Capture Engine</h2>
        </div>
        <span className={`status-pill ${devices.length > 0 ? "status-live" : "status-muted"}`}>{status}</span>
      </div>

      <div className="device-list">
        {devices.length > 0 ? (
          devices.map((device) => (
            <div className="device-row" key={device.id}>
              <div className="device-icon">{deviceIcon(device.kind)}</div>
              <div className="device-copy">
                <strong>{device.label}</strong>
                <span>{device.kind}</span>
              </div>
              <div className="meter" aria-label={`${device.label} level`}>
                <span style={{ width: `${Math.round(device.level * 100)}%` }} />
              </div>
              <span className={`select-dot ${device.selected ? "selected" : ""}`} />
            </div>
          ))
        ) : (
          <p className="empty-copy">Manual transcript mode is active. Real microphone and system audio capture are the next native phase.</p>
        )}
      </div>
    </section>
  );
}

function deviceIcon(kind: AudioDevice["kind"]) {
  if (kind === "microphone") {
    return <Mic size={18} />;
  }

  if (kind === "virtual") {
    return <RadioTower size={18} />;
  }

  return <MonitorSpeaker size={18} />;
}
