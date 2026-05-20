import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Settings } from "./Settings";

describe("Settings", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows controls for live audio, STT, automation, OCR, TTS, security, and plugins", async () => {
    render(<Settings />);

    expect(await screen.findByText("Audio And STT")).toBeInTheDocument();
    expect(screen.getByText("Automatic Answering")).toBeInTheDocument();
    expect(screen.getByText("Screen OCR")).toBeInTheDocument();
    expect(screen.getByText("Text To Speech")).toBeInTheDocument();
    expect(screen.getByText("Security And Updates")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check Signed Updates" })).toBeInTheDocument();
    expect(screen.getByText("Plugin System")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load Plugins" })).toBeInTheDocument();
  });

  it("shows OS keychain controls for cloud provider API keys", async () => {
    render(<Settings />);

    expect(await screen.findByText("API Key Vault")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Key" })).toBeInTheDocument();
    expect(screen.getByText(/OS keychain/i)).toBeInTheDocument();
  });

  it("uses select controls for microphone and system audio devices", async () => {
    render(<Settings />);

    expect(await screen.findByRole("combobox", { name: "Microphone device" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "System audio device" })).toBeInTheDocument();
  });

  it("shows OS keychain controls for cloud STT provider keys", async () => {
    render(<Settings />);

    expect(await screen.findByRole("button", { name: "Save STT Key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete STT Key" })).toBeInTheDocument();
  });

  it("shows screen OCR capture and review controls", async () => {
    render(<Settings />);

    expect(await screen.findByRole("button", { name: "Capture Screen OCR" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Reviewed OCR text" })).toBeInTheDocument();
  });

  it("shows knowledge base import controls", async () => {
    render(<Settings />);

    expect(await screen.findByRole("button", { name: "Add Knowledge Document" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Knowledge text" })).toBeInTheDocument();
    expect(screen.getByLabelText("Knowledge files")).toBeInTheDocument();
  });

  it("shows global overlay hotkey controls", async () => {
    render(<Settings />);

    expect(await screen.findByRole("textbox", { name: "Overlay hotkey" })).toBeInTheDocument();
    expect(screen.getByLabelText("Auto-hide when screen sharing")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Overlay X" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Overlay width" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read Overlay Position" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply Overlay Position" })).toBeInTheDocument();
  });
});
