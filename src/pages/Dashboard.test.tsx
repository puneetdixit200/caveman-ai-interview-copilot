import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as tauri from "../lib/tauri";
import { Dashboard } from "./Dashboard";

vi.mock("../lib/globalHotkeys", () => ({
  registerGlobalActionShortcuts: vi.fn(async () => ({
    registeredShortcuts: { overlay: "CommandOrControl+Shift+O" },
    errors: {},
    dispose: vi.fn(async () => undefined)
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
  protectOverlayWindow: vi.fn(async () => ({
    alwaysOnTop: false,
    skipTaskbar: false,
    captureExclusion: "unsupported",
    clickThrough: false,
    visible: false
  })),
  setOverlayWindowBounds: vi.fn(async (bounds) => bounds),
  setOverlayWindowVisible: vi.fn(async (visible) => ({
    alwaysOnTop: false,
    skipTaskbar: false,
    captureExclusion: "unsupported",
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
});
