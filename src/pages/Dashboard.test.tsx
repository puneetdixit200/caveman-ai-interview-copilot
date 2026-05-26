import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG, serializeAppConfig } from "../lib/appConfig";
import * as tauri from "../lib/tauri";
import { Dashboard } from "./Dashboard";

const ttsMocks = vi.hoisted(() => ({
  enqueueTtsResponse: vi.fn(() => [
    {
      id: "tts-1",
      text: "Use idempotency keys.",
      voice: "default",
      language: "en-US",
      rate: 1,
      volume: 0.8
    }
  ]),
  playTtsItem: vi.fn(() => true),
  stopTtsPlayback: vi.fn()
}));

vi.mock("../lib/globalHotkeys", () => ({
  registerGlobalActionShortcuts: vi.fn(async () => ({
    registeredShortcuts: { overlay: "CommandOrControl+Shift+O" },
    errors: {},
    dispose: vi.fn(async () => undefined)
  }))
}));

vi.mock("../lib/tts", () => ({
  enqueueTtsResponse: ttsMocks.enqueueTtsResponse,
  playTtsItem: ttsMocks.playTtsItem,
  stopTtsPlayback: ttsMocks.stopTtsPlayback
}));

vi.mock("../lib/providerClients", () => ({
  createConfiguredProvider: vi.fn(() => ({
    id: "ollama",
    label: "Ollama",
    kind: "local",
    healthCheck: vi.fn(async () => ({ ok: true, latencyMs: 1 })),
    async *chatStream() {
      yield "Use exponential ";
      yield "backoff.";
    }
  }))
}));

vi.mock("../lib/tauri", () => ({
  addAiResponse: vi.fn(),
  addTranscript: vi.fn(),
  createSession: vi.fn(),
  getCaptureStatus: vi.fn(async () => ({
    running: false,
    systemDeviceId: "default",
    microphoneDeviceId: "default",
    sampleRateHz: 16000,
    channels: 1,
    microphoneLevel: 0,
    systemLevel: 0,
    gainDb: 0,
    noiseGateDb: -80,
    systemCaptureSupported: false
  })),
  getCollaborationStatus: vi.fn(async () => ({
    running: false,
    hintCount: 0
  })),
  getProviderApiKey: vi.fn(async () => undefined),
  getSetting: vi.fn(async () => undefined),
  isRunningInTauri: vi.fn(() => false),
  detectScreenShareStatus: vi.fn(async () => ({
    active: false,
    matchedProcesses: []
  })),
  listAudioDevices: vi.fn(async () => []),
  listAiResponses: vi.fn(async () => [
    {
      id: 1,
      sessionId: "s1",
      response: "Use idempotency keys.",
      model: "llama3.1:8b",
      provider: "ollama",
      latencyMs: 800,
      createdAt: "2026-05-21T00:00:02.000Z"
    }
  ]),
  listSessions: vi.fn(async () => [
    {
      id: "s1",
      title: "Live Interview Session",
      company: "Stripe",
      role: "Backend Engineer",
      interviewType: "system_design",
      tags: ["real-use"],
      status: "active",
      totalTokens: 0,
      durationSeconds: 0,
      createdAt: "2026-05-21T00:00:00.000Z"
    }
  ]),
  listTranscripts: vi.fn(async () => [
    {
      id: 1,
      sessionId: "s1",
      speaker: "interviewer",
      content: "How would you design retries?",
      timestampMs: 1200,
      confidence: 0.95,
      createdAt: "2026-05-21T00:00:01.000Z"
    }
  ]),
  onAudioChunk: vi.fn(async () => () => undefined),
  onAudioLevel: vi.fn(async () => () => undefined),
  protectOverlayWindow: vi.fn(async (captureExclusionEnabled = true) => ({
    alwaysOnTop: false,
    skipTaskbar: false,
    captureExclusion: captureExclusionEnabled ? "unsupported" : "disabled",
    clickThrough: false,
    visible: false
  })),
  setOverlayWindowBounds: vi.fn(async (bounds) => bounds),
  setOverlayWindowVisible: vi.fn(async (visible, captureExclusionEnabled = true) => ({
    alwaysOnTop: false,
    skipTaskbar: false,
    captureExclusion: captureExclusionEnabled ? "unsupported" : "disabled",
    clickThrough: false,
    visible
  })),
  startCapture: vi.fn(),
  stopCapture: vi.fn(),
  typeTextIntoActiveWindow: vi.fn(),
  startCollaborationServer: vi.fn(async () => ({
    running: true,
    url: "http://127.0.0.1:43125/?token=secret",
    token: "secret",
    hintCount: 1,
    message: "Helper link started"
  })),
  stopCollaborationServer: vi.fn(async () => ({
    running: false,
    url: undefined,
    token: undefined,
    hintCount: 0,
    message: "Helper link stopped"
  })),
  publishCollaborationSnapshot: vi.fn(async () => undefined),
  listCollaborationHints: vi.fn(async () => [
    {
      id: "hint-1",
      message: "Mention exponential backoff tradeoffs.",
      createdAtMs: 1800
    }
  ]),
  clearCollaborationHint: vi.fn(async () => undefined)
}));

describe("Dashboard collaboration helper", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    ttsMocks.enqueueTtsResponse.mockClear();
    ttsMocks.playTtsItem.mockClear();
    ttsMocks.stopTtsPlayback.mockClear();
  });

  it("starts a trusted helper link and shows incoming helper hints", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(await screen.findByText("Live Interview Session")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start Helper Link" }));

    expect(tauri.startCollaborationServer).toHaveBeenCalledWith({ bindHost: "127.0.0.1", port: 0 });
    expect(await screen.findByRole("textbox", { name: "Helper share link" })).toHaveValue(
      "http://127.0.0.1:43125/?token=secret"
    );
    expect(await screen.findByText("Mention exponential backoff tradeoffs.")).toBeInTheDocument();

    await waitFor(() =>
      expect(tauri.publishCollaborationSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({ id: "s1", title: "Live Interview Session" }),
          transcripts: expect.arrayContaining([
            expect.objectContaining({ speaker: "interviewer", content: "How would you design retries?" })
          ]),
          responses: expect.arrayContaining([expect.objectContaining({ response: "Use idempotency keys." })])
        })
      )
    );
  });

  it("starts a new live session with real interview metadata", async () => {
    vi.mocked(tauri.createSession).mockResolvedValueOnce({
      id: "s2",
      title: "Frontend Loop",
      company: "Acme",
      role: "UI Engineer",
      interviewType: "frontend",
      tags: ["react", "accessibility"],
      status: "active",
      totalTokens: 0,
      durationSeconds: 0,
      notes: "Focus on accessible component design.",
      createdAt: "2026-05-21T00:10:00.000Z"
    });
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(await screen.findByText("Live Interview Session")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New session title"), { target: { value: "Frontend Loop" } });
    fireEvent.change(screen.getByLabelText("New session company"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("New session role"), { target: { value: "UI Engineer" } });
    await user.selectOptions(screen.getByLabelText("New session interview type"), "frontend");
    fireEvent.change(screen.getByLabelText("New session tags"), { target: { value: "react, accessibility" } });
    fireEvent.change(screen.getByLabelText("New session notes"), {
      target: { value: "Focus on accessible component design." }
    });
    await user.click(screen.getByRole("button", { name: "Start New Session" }));

    expect(tauri.createSession).toHaveBeenCalledWith({
      title: "Frontend Loop",
      company: "Acme",
      role: "UI Engineer",
      interviewType: "frontend",
      tags: ["react", "accessibility"],
      notes: "Focus on accessible component design."
    });
    expect(await screen.findByText("Frontend Loop")).toBeInTheDocument();
    expect(screen.queryByText("How would you design retries?")).not.toBeInTheDocument();
  });

  it("passes the selected capture mode to native audio capture", async () => {
    vi.mocked(tauri.getSetting)
      .mockResolvedValueOnce(
        serializeAppConfig({
          ...DEFAULT_APP_CONFIG,
          audio: {
            ...DEFAULT_APP_CONFIG.audio,
            captureMode: "system",
            dualStreamEnabled: false,
            systemDeviceId: "speaker-loopback",
            microphoneDeviceId: "mic-1",
            applicationTargetId: "pid:4242",
            applicationTargetLabel: "Zoom Meeting",
            gainDb: 4,
            noiseGateDb: -50
          }
        })
      )
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    vi.mocked(tauri.startCapture).mockResolvedValueOnce({
      running: true,
      systemDeviceId: "speaker-loopback",
      microphoneDeviceId: "",
      applicationTargetId: "pid:4242",
      applicationTargetLabel: "Zoom Meeting",
      sampleRateHz: 16000,
      channels: 1,
      microphoneLevel: 0,
      systemLevel: 0,
      gainDb: 4,
      noiseGateDb: -50,
      systemCaptureSupported: true
    });
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(await screen.findByText("Live Interview Session")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(tauri.startCapture).toHaveBeenCalledWith({
      captureMode: "system",
      dualStreamEnabled: false,
      systemDeviceId: "speaker-loopback",
      microphoneDeviceId: "mic-1",
      applicationTargetId: "pid:4242",
      applicationTargetLabel: "Zoom Meeting",
      gainDb: 4,
      noiseGateDb: -50
    });
  });

  it("keeps manual transcript mode active without opening native audio streams", async () => {
    vi.mocked(tauri.getSetting)
      .mockResolvedValueOnce(
        serializeAppConfig({
          ...DEFAULT_APP_CONFIG,
          audio: {
            ...DEFAULT_APP_CONFIG.audio,
            captureMode: "manual",
            dualStreamEnabled: false,
            sttMode: "manual"
          },
          stt: {
            ...DEFAULT_APP_CONFIG.stt,
            selectedMode: "manual"
          }
        })
      )
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(await screen.findByText("Live Interview Session")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(tauri.startCapture).not.toHaveBeenCalled();
    expect(await screen.findByText("Manual transcript mode active")).toBeInTheDocument();
  });

  it("does not request screen capture exclusion when the security setting is disabled", async () => {
    vi.mocked(tauri.getSetting)
      .mockResolvedValueOnce(
        serializeAppConfig({
          ...DEFAULT_APP_CONFIG,
          security: {
            ...DEFAULT_APP_CONFIG.security,
            captureExclusionEnabled: false
          }
        })
      )
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    render(<Dashboard />);

    expect(await screen.findByText("Live Interview Session")).toBeInTheDocument();
    await waitFor(() => expect(tauri.protectOverlayWindow).toHaveBeenCalledWith(false));
    expect(await screen.findByText("Capture disabled")).toBeInTheDocument();
  });

  it("auto-hides the overlay when a screen sharing process is detected", async () => {
    vi.mocked(tauri.getSetting)
      .mockResolvedValueOnce(
        serializeAppConfig({
          ...DEFAULT_APP_CONFIG,
          overlay: {
            ...DEFAULT_APP_CONFIG.overlay,
            autoHideOnScreenShare: true
          }
        })
      )
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    vi.mocked(tauri.protectOverlayWindow).mockResolvedValueOnce({
      alwaysOnTop: true,
      skipTaskbar: true,
      captureExclusion: "enabled",
      clickThrough: true,
      visible: true
    });
    vi.mocked(tauri.detectScreenShareStatus).mockResolvedValueOnce({
      active: true,
      matchedProcesses: [{ name: "zoom.exe", pid: 4242 }]
    });

    render(<Dashboard />);

    expect(await screen.findByText("Live Interview Session")).toBeInTheDocument();
    await waitFor(() => expect(tauri.detectScreenShareStatus).toHaveBeenCalled());
    expect(await screen.findByText("Overlay hidden because screen sharing process is running: zoom.exe.")).toBeInTheDocument();
    expect(tauri.setOverlayWindowVisible).toHaveBeenCalledWith(false, true);
  });

  it("auto-hides the overlay when screen sharing detection fails closed", async () => {
    vi.mocked(tauri.getSetting)
      .mockResolvedValueOnce(
        serializeAppConfig({
          ...DEFAULT_APP_CONFIG,
          overlay: {
            ...DEFAULT_APP_CONFIG.overlay,
            autoHideOnScreenShare: true
          }
        })
      )
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    vi.mocked(tauri.protectOverlayWindow).mockResolvedValueOnce({
      alwaysOnTop: true,
      skipTaskbar: true,
      captureExclusion: "enabled",
      clickThrough: true,
      visible: true
    });
    vi.mocked(tauri.detectScreenShareStatus).mockRejectedValueOnce(new Error("tasklist failed"));

    render(<Dashboard />);

    expect(await screen.findByText("Live Interview Session")).toBeInTheDocument();
    await waitFor(() => expect(tauri.detectScreenShareStatus).toHaveBeenCalled());
    expect(
      await screen.findByText("Overlay hidden because screen-share guard could not verify that sharing is clear.")
    ).toBeInTheDocument();
    expect(tauri.setOverlayWindowVisible).toHaveBeenCalledWith(false, true);
  });

  it("does not arm Deepgram streaming while local-only mode blocks cloud calls", async () => {
    vi.mocked(tauri.getSetting)
      .mockResolvedValueOnce(
        serializeAppConfig({
          ...DEFAULT_APP_CONFIG,
          security: {
            ...DEFAULT_APP_CONFIG.security,
            localOnlyMode: true,
            blockCloudWhenLocalOnly: true
          },
          stt: {
            ...DEFAULT_APP_CONFIG.stt,
            selectedMode: "deepgram",
            apiKey: "dg_key"
          }
        })
      )
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    vi.mocked(tauri.startCapture).mockResolvedValueOnce({
      running: true,
      systemDeviceId: "default",
      microphoneDeviceId: "default",
      applicationTargetId: "all-system-audio",
      applicationTargetLabel: "All system audio",
      sampleRateHz: 16000,
      channels: 1,
      microphoneLevel: 0,
      systemLevel: 0,
      gainDb: 0,
      noiseGateDb: -45,
      systemCaptureSupported: true
    });
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(await screen.findByText("Live Interview Session")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("Cloud STT is blocked by local-only mode.")).toBeInTheDocument();
    expect(tauri.onAudioChunk).not.toHaveBeenCalled();
  });

  it("auto-types the saved AI response when auto-answer typing is enabled", async () => {
    vi.mocked(tauri.getSetting)
      .mockResolvedValueOnce(
        serializeAppConfig({
          ...DEFAULT_APP_CONFIG,
          autoAnswer: {
            enabled: true,
            typeIntoActiveWindow: true,
            delayMs: 0
          }
        })
      )
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    vi.mocked(tauri.addAiResponse).mockResolvedValueOnce({
      id: 2,
      sessionId: "s1",
      triggerTranscriptId: 1,
      promptMessages: "[]",
      response: "Use exponential backoff.",
      model: "llama3.1:8b",
      provider: "ollama",
      inputTokens: 10,
      outputTokens: 4,
      latencyMs: 25,
      createdAt: "2026-05-21T00:00:03.000Z"
    });
    vi.mocked(tauri.typeTextIntoActiveWindow).mockResolvedValueOnce({
      characterCount: 24,
      inputEventCount: 48
    });
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(await screen.findByText("Live Interview Session")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(tauri.typeTextIntoActiveWindow).toHaveBeenCalledWith("Use exponential backoff."));
    expect(await screen.findByText("AI response saved and auto-typed into the active window")).toBeInTheDocument();
  });

  it("speaks and stops the latest saved answer on demand", async () => {
    vi.mocked(tauri.getSetting)
      .mockResolvedValueOnce(
        serializeAppConfig({
          ...DEFAULT_APP_CONFIG,
          tts: {
            ...DEFAULT_APP_CONFIG.tts,
            enabled: true,
            voice: "default",
            language: "en-US",
            rate: 1,
            volume: 0.8
          }
        })
      )
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(await screen.findByText("Live Interview Session")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Speak Latest" }));

    expect(ttsMocks.enqueueTtsResponse).toHaveBeenCalledWith(
      [],
      "Use idempotency keys.",
      expect.objectContaining({ enabled: true, language: "en-US" }),
      expect.any(Boolean)
    );
    expect(ttsMocks.playTtsItem).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Use idempotency keys." })
    );
    expect(await screen.findByText("Speaking latest answer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop Speech" }));

    expect(ttsMocks.stopTtsPlayback).toHaveBeenCalled();
    expect(await screen.findByText("TTS playback stopped")).toBeInTheDocument();
  });
});
