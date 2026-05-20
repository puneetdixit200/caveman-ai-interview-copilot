import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Settings } from "./Settings";

describe("Settings", () => {
  it("shows controls for live audio, STT, automation, OCR, TTS, security, and plugins", async () => {
    render(<Settings />);

    expect(await screen.findByText("Audio And STT")).toBeInTheDocument();
    expect(screen.getByText("Automatic Answering")).toBeInTheDocument();
    expect(screen.getByText("Screen OCR")).toBeInTheDocument();
    expect(screen.getByText("Text To Speech")).toBeInTheDocument();
    expect(screen.getByText("Security And Updates")).toBeInTheDocument();
    expect(screen.getByText("Plugin System")).toBeInTheDocument();
  });
});
