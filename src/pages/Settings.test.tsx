import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_CONFIG_SETTING_KEY, DEFAULT_APP_CONFIG, serializeAppConfig, type AppConfig } from "../lib/appConfig";
import { runAudioCaptureRehearsal } from "../lib/audioRehearsal";
import { KNOWLEDGE_BASE_SETTING_KEY, parseKnowledgeBase } from "../lib/knowledge";
import { PREFLIGHT_REPORT_SETTING_KEY } from "../lib/preflightReport";
import { runScreenOcr } from "../lib/ocr";
import { createConfiguredProvider } from "../lib/providerClients";
import { checkForSignedUpdate, downloadInstallAndRelaunchSignedUpdate } from "../lib/updater";
import { Settings } from "./Settings";

vi.mock("../lib/providerClients", () => ({
  createConfiguredProvider: vi.fn(() => ({
    healthCheck: vi.fn(async () => ({ ok: true, latencyMs: 1 })),
    listModels: vi.fn(async () => [])
  }))
}));

vi.mock("../lib/audioRehearsal", () => ({
  runAudioCaptureRehearsal: vi.fn(async () => ({
    status: "ready",
    started: true,
    durationMs: 500,
    expectedSources: ["microphone"],
    microphonePeak: 0.32,
    systemPeak: 0,
    microphoneEvents: 2,
    systemEvents: 0,
    microphoneReady: true,
    systemReady: true,
    warnings: [],
    message: "Audio rehearsal detected microphone."
  }))
}));

vi.mock("../lib/ocr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ocr")>()),
  runScreenOcr: vi.fn(async () => ({
    provider: "local_tesseract",
    text: "captured text",
    capturedAtMs: 1234
  }))
}));

vi.mock("../lib/updater", () => ({
  checkForSignedUpdate: vi.fn(async () => ({ available: false })),
  downloadInstallAndRelaunchSignedUpdate: vi.fn(async () => ({ available: false }))
}));

describe("Settings", () => {
  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("shows controls for live audio, STT, automation, OCR, TTS, security, and plugins", async () => {
    render(<Settings />);

    expect(await screen.findByText("Real-Use Readiness")).toBeInTheDocument();
    expect(screen.getByText("Runtime Budget")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Runtime Budget" })).toBeInTheDocument();
    expect(await screen.findByText("Audio And STT")).toBeInTheDocument();
    expect(screen.getByText("Automatic Answering")).toBeInTheDocument();
    expect(screen.getByText("Screen OCR")).toBeInTheDocument();
    expect(screen.getByText("Text To Speech")).toBeInTheDocument();
    expect(screen.getByText("Security And Updates")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check Signed Updates" })).toBeInTheDocument();
    expect(screen.getByText("Plugin System")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load Plugins" })).toBeInTheDocument();
  });

  it("shows preflight actions for settings that are not interview-ready", async () => {
    render(<Settings />);

    expect(await screen.findByText("Manual audio capture")).toBeInTheDocument();
    expect(screen.getByText("Manual transcript mode")).toBeInTheDocument();
    expect(screen.getByText("Manual answer trigger")).toBeInTheDocument();
    expect(screen.getByText("Switch Audio capture mode to Microphone, System, or Dual before a live call.")).toBeInTheDocument();
  });

  it("saves a timestamped real-use preflight report from Settings", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(await screen.findByRole("button", { name: "Save Preflight Report" }));

    const report = localStorage.getItem(PREFLIGHT_REPORT_SETTING_KEY) ?? "";
    expect(report).toContain("# Caveman Preflight Report");
    expect(report).toContain("Overall:");
    expect(report).toContain("Manual audio capture");
    expect(await screen.findByText("Preflight report saved")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Latest preflight report" })).toHaveValue(report);
  });

  it("shows OS keychain controls for cloud provider API keys", async () => {
    render(<Settings />);

    expect(await screen.findByText("API Key Vault")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "OpenAI" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Anthropic" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Groq" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Google Gemini" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mistral" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Together AI" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Fireworks AI" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save Key" }).length).toBeGreaterThanOrEqual(8);
    expect(screen.getAllByRole("button", { name: "Delete Key" }).length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText(/OS keychain/i)).toBeInTheDocument();
  });

  it("shows a security activity log for sensitive settings actions", async () => {
    render(<Settings />);

    const openAiLabel = (await screen.findAllByText("OpenAI")).find(
      (element) => element.tagName.toLowerCase() === "strong"
    );
    const openAiEditor = openAiLabel?.closest("article");
    expect(openAiEditor).not.toBeNull();

    fireEvent.change(within(openAiEditor as HTMLElement).getByLabelText("API key"), {
      target: { value: "sk-live-secret" }
    });
    fireEvent.click(within(openAiEditor as HTMLElement).getByRole("button", { name: "Save Key" }));

    expect(await screen.findByText("Security Activity")).toBeInTheDocument();
    expect(await screen.findByText("provider_key_saved")).toBeInTheDocument();
    expect(screen.getByText(/secret \/ openai/)).toBeInTheDocument();
    expect(screen.queryByText("sk-live-secret")).not.toBeInTheDocument();
  });

  it("uses select controls for microphone and system audio devices", async () => {
    render(<Settings />);

    expect(await screen.findByRole("combobox", { name: "Microphone device" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "System audio device" })).toBeInTheDocument();
  });

  it("runs a live audio rehearsal from Settings", async () => {
    const user = userEvent.setup();
    storeConfig({
      audio: {
        ...DEFAULT_APP_CONFIG.audio,
        captureMode: "microphone",
        microphoneDeviceId: "microphone-default"
      }
    });
    render(<Settings />);

    await user.click(await screen.findByRole("button", { name: "Run Audio Rehearsal" }));

    expect(runAudioCaptureRehearsal).toHaveBeenCalledWith({
      config: expect.objectContaining({
        audio: expect.objectContaining({ captureMode: "microphone" })
      })
    });
    expect(await screen.findByText("Audio rehearsal detected microphone.")).toBeInTheDocument();
    expect(screen.getByText("Mic peak 32%")).toBeInTheDocument();
  });

  it("shows application audio source selection", async () => {
    render(<Settings />);

    const applicationSource = await screen.findByRole("combobox", { name: "Application source" });
    expect(applicationSource).toHaveValue("all-system-audio");
    expect(screen.getByRole("option", { name: "All system audio" })).toBeInTheDocument();
  });

  it("keeps a saved application audio source visible when the app is not currently listed", async () => {
    storeConfig({
      audio: {
        ...DEFAULT_APP_CONFIG.audio,
        applicationTargetId: "pid:4242",
        applicationTargetLabel: "Zoom Meeting"
      }
    });

    render(<Settings />);

    expect(await screen.findByRole("combobox", { name: "Application source" })).toHaveValue("pid:4242");
    expect(screen.getByRole("option", { name: "Zoom Meeting" })).toBeInTheDocument();
  });

  it("shows OS keychain controls for cloud STT provider keys", async () => {
    render(<Settings />);

    expect(await screen.findByRole("button", { name: "Save STT Key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete STT Key" })).toBeInTheDocument();
  });

  it("makes automatic STT language detection a first-class setting", async () => {
    render(<Settings />);

    const languageSelect = await screen.findByRole("combobox", { name: "STT language" });
    expect(languageSelect).toHaveValue("auto");
    expect(screen.getByRole("option", { name: "Auto detect" })).toBeInTheDocument();
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

  it("shows guarded auto-answer typing controls", async () => {
    render(<Settings />);

    expect(await screen.findByLabelText("Enable auto-answer typing")).toBeInTheDocument();
    expect(screen.getByLabelText("Type generated answers into active window")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Auto-answer typing delay" })).toHaveValue(1500);
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

  it("deletes stale knowledge documents and clears the knowledge base", async () => {
    render(<Settings />);

    await screen.findByRole("button", { name: "Add Knowledge Document" });
    fireEvent.change(screen.getByLabelText("Knowledge title"), { target: { value: "Payments Project" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Knowledge text" }), {
      target: { value: "Built Stripe webhook retries with queue backoff." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Knowledge Document" }));
    expect(await screen.findByText("Added Payments Project to the knowledge base")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Knowledge title"), { target: { value: "Legacy AngularJS Migration" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Knowledge text" }), {
      target: { value: "Migrated AngularJS templates into React routes." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Knowledge Document" }));
    expect(await screen.findByText("Added Legacy AngularJS Migration to the knowledge base")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search knowledge" }), {
      target: { value: "AngularJS migration" }
    });
    expect(await screen.findByText("project: Legacy AngularJS Migration")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete knowledge document Legacy AngularJS Migration" }));

    await waitFor(() =>
      expect(parseKnowledgeBase(localStorage.getItem(KNOWLEDGE_BASE_SETTING_KEY)).documents.map((document) => document.id)).toEqual([
        "payments-project"
      ])
    );
    expect(screen.queryByText("project: Legacy AngularJS Migration")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear Knowledge Base" }));

    await waitFor(() =>
      expect(parseKnowledgeBase(localStorage.getItem(KNOWLEDGE_BASE_SETTING_KEY))).toEqual({
        documents: [],
        chunks: []
      })
    );
    expect(screen.getByText("0 documents / 0 chunks")).toBeInTheDocument();
  }, 10_000);

  it("shows context window token budget controls", async () => {
    render(<Settings />);

    expect(await screen.findByRole("spinbutton", { name: "Prompt token budget" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Reserved answer tokens" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Transcript turns in prompt" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Supplemental context tokens" })).toBeInTheDocument();
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

  it("refreshes provider models and applies a discovered model", async () => {
    const listModels = vi.fn(async () => [
      {
        id: "llama3.1:8b",
        name: "llama3.1:8b",
        contextLength: 8192
      }
    ]);
    vi.mocked(createConfiguredProvider).mockReturnValueOnce({
      id: "ollama",
      label: "Ollama",
      kind: "local",
      healthCheck: vi.fn(async () => ({ ok: true, latencyMs: 1 })),
      chatStream: vi.fn(),
      listModels
    });
    const user = userEvent.setup();
    render(<Settings />);

    await user.click((await screen.findAllByRole("button", { name: "Refresh Models" }))[0]);

    expect(listModels).toHaveBeenCalled();
    await user.selectOptions(await screen.findByRole("combobox", { name: "Ollama available models" }), "llama3.1:8b");

    expect(screen.getAllByLabelText("Model")[0]).toHaveValue("llama3.1:8b");
    expect(screen.getByText("Loaded 1 model for Ollama")).toBeInTheDocument();
  });

  it("blocks cloud provider health checks and model refreshes in local-only mode", async () => {
    const user = userEvent.setup();
    storeConfig({
      security: {
        ...DEFAULT_APP_CONFIG.security,
        localOnlyMode: true,
        blockCloudWhenLocalOnly: true
      }
    });

    render(<Settings />);

    const openRouterLabel = (await screen.findAllByText("OpenRouter")).find(
      (element) => element.tagName.toLowerCase() === "strong"
    );
    const openRouterEditor = openRouterLabel?.closest("article");
    expect(openRouterEditor).not.toBeNull();

    await user.click(within(openRouterEditor as HTMLElement).getByRole("button", { name: "Refresh Models" }));
    expect(createConfiguredProvider).not.toHaveBeenCalled();
    expect(screen.getByText("Cloud providers are blocked by local-only mode.")).toBeInTheDocument();

    await user.click(within(openRouterEditor as HTMLElement).getByRole("button", { name: "Test" }));
    expect(createConfiguredProvider).not.toHaveBeenCalled();
    expect(screen.getByText("Cloud providers are blocked by local-only mode.")).toBeInTheDocument();
  });

  it("blocks cloud OCR capture in local-only mode", async () => {
    const user = userEvent.setup();
    storeConfig({
      security: {
        ...DEFAULT_APP_CONFIG.security,
        localOnlyMode: true,
        blockCloudWhenLocalOnly: true
      },
      ocr: {
        ...DEFAULT_APP_CONFIG.ocr,
        enabled: true,
        provider: "cloud"
      }
    });

    render(<Settings />);

    await user.click(await screen.findByRole("button", { name: "Capture Screen OCR" }));

    expect(runScreenOcr).not.toHaveBeenCalled();
    expect(screen.getByText("Cloud OCR is blocked by local-only mode.")).toBeInTheDocument();
  });

  it("blocks signed update network checks in local-only mode", async () => {
    const user = userEvent.setup();
    storeConfig({
      security: {
        ...DEFAULT_APP_CONFIG.security,
        localOnlyMode: true,
        blockCloudWhenLocalOnly: true
      }
    });

    render(<Settings />);

    await user.click(await screen.findByRole("button", { name: "Check Signed Updates" }));
    expect(checkForSignedUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("Signed update checks are blocked by local-only mode.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Install Signed Update" }));
    expect(downloadInstallAndRelaunchSignedUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("Signed update checks are blocked by local-only mode.")).toBeInTheDocument();
  });
});

function storeConfig(patch: Partial<AppConfig>) {
  const config: AppConfig = {
    ...DEFAULT_APP_CONFIG,
    ...patch,
    providers: patch.providers ?? DEFAULT_APP_CONFIG.providers.map((provider) => ({ ...provider })),
    audio: { ...DEFAULT_APP_CONFIG.audio, ...patch.audio },
    stt: {
      ...DEFAULT_APP_CONFIG.stt,
      ...patch.stt,
      speakerCalibration: {
        ...DEFAULT_APP_CONFIG.stt.speakerCalibration,
        ...patch.stt?.speakerCalibration
      }
    },
    autoTrigger: { ...DEFAULT_APP_CONFIG.autoTrigger, ...patch.autoTrigger },
    contextWindow: { ...DEFAULT_APP_CONFIG.contextWindow, ...patch.contextWindow },
    ocr: { ...DEFAULT_APP_CONFIG.ocr, ...patch.ocr },
    tts: { ...DEFAULT_APP_CONFIG.tts, ...patch.tts },
    overlay: {
      ...DEFAULT_APP_CONFIG.overlay,
      ...patch.overlay,
      bounds: {
        ...DEFAULT_APP_CONFIG.overlay.bounds,
        ...patch.overlay?.bounds
      }
    },
    shortcuts: { ...DEFAULT_APP_CONFIG.shortcuts, ...patch.shortcuts },
    security: { ...DEFAULT_APP_CONFIG.security, ...patch.security },
    plugins: { ...DEFAULT_APP_CONFIG.plugins, ...patch.plugins },
    autoAnswer: { ...DEFAULT_APP_CONFIG.autoAnswer, ...patch.autoAnswer },
    profiles: patch.profiles ?? []
  };

  localStorage.setItem(APP_CONFIG_SETTING_KEY, serializeAppConfig(config));
}
