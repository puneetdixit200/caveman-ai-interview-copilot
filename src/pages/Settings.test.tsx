import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect(screen.getByRole("option", { name: "OpenAI" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Anthropic" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Groq" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save Key" }).length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByRole("button", { name: "Delete Key" }).length).toBeGreaterThanOrEqual(4);
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

  it("shows local Whisper setup helper controls", async () => {
    render(<Settings />);

    expect(await screen.findByRole("button", { name: "Auto Detect Whisper" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Base.en Model" })).toBeInTheDocument();
  });

  it("shows speaker calibration controls for source and provider diarization labels", async () => {
    render(<Settings />);

    expect(await screen.findByRole("combobox", { name: "System audio default speaker" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Microphone default speaker" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Provider speaker 0" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Provider speaker 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Prefer provider diarization labels")).toBeInTheDocument();
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

  it("imports resume and job description files into prompt context", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    const resumeFile = new File(["Built payments APIs with TypeScript."], "resume.md", {
      type: "text/markdown"
    });
    const jdFile = new File(["Role needs distributed systems and queues."], "jd.txt", {
      type: "text/plain"
    });

    await user.upload(await screen.findByLabelText("Resume file"), resumeFile);
    await user.upload(screen.getByLabelText("Job description file"), jdFile);

    expect((screen.getByRole("textbox", { name: "Resume context" }) as HTMLTextAreaElement).value).toContain(
      "Built payments APIs with TypeScript."
    );
    expect((screen.getByRole("textbox", { name: "Job description context" }) as HTMLTextAreaElement).value).toContain(
      "Role needs distributed systems and queues."
    );
  });

  it("shows global overlay hotkey controls", async () => {
    render(<Settings />);

    expect(await screen.findByRole("textbox", { name: "Overlay hotkey" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Capture hotkey" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Generate answer hotkey" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Type latest answer hotkey" })).toBeInTheDocument();
    expect(screen.getByLabelText("Auto-hide when screen sharing")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Overlay X" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Overlay width" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read Overlay Position" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply Overlay Position" })).toBeInTheDocument();
  });

  it("saves and applies a reusable interview profile", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    fireEvent.change(await screen.findByLabelText("Primary provider"), { target: { value: "openrouter" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Generate answer hotkey" }), {
      target: { value: "Ctrl+Alt+G" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Profile name" }), {
      target: { value: "System Design Profile" }
    });
    await user.click(screen.getByRole("button", { name: "Save Profile" }));
    fireEvent.change(screen.getByLabelText("Primary provider"), { target: { value: "ollama" } });

    await user.click(await screen.findByRole("button", { name: "Apply Profile" }));

    expect(screen.getByLabelText("Primary provider")).toHaveValue("openrouter");
    expect(screen.getByRole("textbox", { name: "Generate answer hotkey" })).toHaveValue("Ctrl+Alt+G");
  });
});
