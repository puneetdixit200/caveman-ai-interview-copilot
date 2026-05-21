import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AudioCaptureState } from "../../lib/audioEvents";
import { AudioControls } from "./AudioControls";

const LIVE_CAPTURE_STATUS: AudioCaptureState = {
  running: true,
  systemDeviceId: "default",
  microphoneDeviceId: "default",
  sampleRateHz: 16000,
  channels: 1,
  microphoneLevel: 0.42,
  systemLevel: 0.7,
  gainDb: 6,
  noiseGateDb: -45,
  systemCaptureSupported: true
};

describe("AudioControls", () => {
  it("renders live native capture streams when the device list is empty", () => {
    render(<AudioControls devices={[]} status="Live" captureStatus={LIVE_CAPTURE_STATUS} />);

    expect(screen.getByText("Default microphone")).toBeInTheDocument();
    expect(screen.getByText("Default system audio")).toBeInTheDocument();
    expect(screen.getByText("16 kHz")).toBeInTheDocument();
    expect(screen.getByText("gain +6 dB")).toBeInTheDocument();
    expect(screen.queryByText(/next native phase/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Default microphone level").firstElementChild).toHaveStyle({ width: "42%" });
    expect(screen.getByLabelText("Default system audio level").firstElementChild).toHaveStyle({ width: "70%" });
  });
});
