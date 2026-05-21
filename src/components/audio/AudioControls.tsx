import { Mic, MonitorSpeaker, RadioTower } from "lucide-react";
import type { AudioCaptureState } from "../../lib/audioEvents";
import type { AudioDevice } from "../../types/settings";

interface AudioControlsProps {
  devices: AudioDevice[];
  status?: string;
  captureStatus?: AudioCaptureState;
}

export function AudioControls({ devices, status = "Armed", captureStatus }: AudioControlsProps) {
  const displayDevices = buildDisplayDevices(devices, captureStatus);
  const isActive = captureStatus?.running || displayDevices.length > 0;

  return (
    <section className="panel audio-panel" aria-label="Audio capture">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Audio</p>
          <h2>Capture Engine</h2>
        </div>
        <span className={`status-pill ${isActive ? "status-live" : "status-muted"}`}>{status}</span>
      </div>

      {captureStatus ? (
        <div className="audio-runtime">
          <span>{formatSampleRate(captureStatus.sampleRateHz)}</span>
          <span>{captureStatus.channels} ch</span>
          <span>gain {formatSignedDb(captureStatus.gainDb)} dB</span>
          <span>gate {captureStatus.noiseGateDb} dB</span>
        </div>
      ) : null}

      <div className="device-list">
        {displayDevices.length > 0 ? (
          displayDevices.map((device) => (
            <div className="device-row" key={device.id}>
              <div className="device-icon">{deviceIcon(device.kind)}</div>
              <div className="device-copy">
                <strong>{device.label}</strong>
                <span>{device.kind}</span>
              </div>
              <div className="meter" aria-label={`${device.label} level`}>
                <span style={{ width: `${Math.round(clampLevel(device.level) * 100)}%` }} />
              </div>
              <span className={`select-dot ${device.selected ? "selected" : ""}`} />
            </div>
          ))
        ) : (
          <p className="empty-copy">No native capture devices reported.</p>
        )}
      </div>
      {captureStatus?.error ? <p className="empty-copy">{captureStatus.error}</p> : null}
    </section>
  );
}

function buildDisplayDevices(devices: AudioDevice[], captureStatus?: AudioCaptureState): AudioDevice[] {
  if (!captureStatus) {
    return devices;
  }

  const patched = devices.map((device) => {
    const isMicrophone =
      device.id === captureStatus.microphoneDeviceId || (device.kind === "microphone" && device.selected);
    const isSystem = device.id === captureStatus.systemDeviceId || (device.kind === "system" && device.selected);
    return {
      ...device,
      selected: device.selected || isMicrophone || isSystem,
      level: isMicrophone ? captureStatus.microphoneLevel : isSystem ? captureStatus.systemLevel : device.level
    };
  });

  if (!captureStatus.running) {
    return patched;
  }

  const hasMicrophone = patched.some(
    (device) => device.id === captureStatus.microphoneDeviceId || (device.kind === "microphone" && device.selected)
  );
  const hasSystem = patched.some(
    (device) => device.id === captureStatus.systemDeviceId || (device.kind === "system" && device.selected)
  );

  return [
    ...patched,
    ...(hasMicrophone
      ? []
      : [
          {
            id: `capture-microphone-${captureStatus.microphoneDeviceId}`,
            label: captureDeviceLabel("microphone", captureStatus.microphoneDeviceId),
            kind: "microphone",
            selected: true,
            level: captureStatus.microphoneLevel
          } satisfies AudioDevice
        ]),
    ...(hasSystem
      ? []
      : [
          {
            id: `capture-system-${captureStatus.systemDeviceId}`,
            label: captureDeviceLabel("system", captureStatus.systemDeviceId),
            kind: "system",
            selected: true,
            level: captureStatus.systemLevel
          } satisfies AudioDevice
        ])
  ];
}

function captureDeviceLabel(source: "microphone" | "system", deviceId: string): string {
  if (!deviceId || deviceId === "default") {
    return source === "microphone" ? "Default microphone" : "Default system audio";
  }

  return source === "microphone" ? `Microphone ${deviceId}` : `System audio ${deviceId}`;
}

function formatSampleRate(sampleRateHz: number): string {
  if (sampleRateHz >= 1000 && sampleRateHz % 1000 === 0) {
    return `${sampleRateHz / 1000} kHz`;
  }

  return `${sampleRateHz} Hz`;
}

function formatSignedDb(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function clampLevel(level: number): number {
  return Math.min(1, Math.max(0, level));
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
