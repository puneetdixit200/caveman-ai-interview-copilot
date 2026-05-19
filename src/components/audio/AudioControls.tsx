import { Mic, MonitorSpeaker, RadioTower } from "lucide-react";
import type { AudioDevice } from "../../types/settings";

interface AudioControlsProps {
  devices: AudioDevice[];
}

export function AudioControls({ devices }: AudioControlsProps) {
  return (
    <section className="panel audio-panel" aria-label="Audio capture">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Audio</p>
          <h2>Capture Engine</h2>
        </div>
        <span className="status-pill status-live">Armed</span>
      </div>

      <div className="device-list">
        {devices.map((device) => (
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
        ))}
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

