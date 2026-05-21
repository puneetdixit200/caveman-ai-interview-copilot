import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_CONFIG_SETTING_KEY, DEFAULT_APP_CONFIG, serializeAppConfig } from "../lib/appConfig";
import { PLUGIN_CATALOG_SETTING_KEY } from "../lib/pluginLoader";
import { Practice } from "./Practice";

const providerMocks = vi.hoisted(() => ({
  createConfiguredProvider: vi.fn(),
  createSession: vi.fn(async () => ({
    id: "practice-session-1",
    title: "Practice - Design a URL shortener",
    interviewType: "system_design",
    tags: ["practice"],
    status: "active",
    totalTokens: 0,
    durationSeconds: 0,
    createdAt: "2026-05-21T12:00:00Z"
  })),
  addTranscript: vi.fn(async (input: { sessionId: string; speaker: string; content: string; timestampMs: number }) => ({
    id: input.speaker === "interviewer" ? 1 : 2,
    ...input,
    createdAt: "2026-05-21T12:00:01Z"
  })),
  addPracticeScore: vi.fn(async (input: { sessionId: string; score: number }) => ({
    id: 1,
    ...input,
    createdAt: "2026-05-21T12:00:02Z"
  })),
  updateSession: vi.fn(async (input: { id: string; status: string }) => ({
    id: input.id,
    title: "Practice - Design a URL shortener",
    interviewType: "system_design",
    tags: ["practice"],
    status: input.status,
    totalTokens: 0,
    durationSeconds: 0,
    createdAt: "2026-05-21T12:00:00Z",
    endedAt: "2026-05-21T12:00:02Z"
  }))
}));

vi.mock("../lib/tauri", () => ({
  addPracticeScore: providerMocks.addPracticeScore,
  addTranscript: providerMocks.addTranscript,
  createSession: providerMocks.createSession,
  getSetting: vi.fn(async (key: string) =>
    key === PLUGIN_CATALOG_SETTING_KEY
      ? JSON.stringify({
          loaded: [],
          errors: [],
          promptTemplates: [],
          exportFormats: [],
          exportTemplates: [],
          practicePacks: [
            {
              id: "queues-pack",
              name: "Queue Interviews",
              interviewType: "system_design",
              questions: [
                {
                  id: "dead-letter",
                  prompt: "Design dead-letter queue handling.",
                  expectedSignals: ["retry", "backoff", "alert"]
                }
              ]
            }
          ]
        })
      : key === APP_CONFIG_SETTING_KEY
        ? serializeAppConfig(DEFAULT_APP_CONFIG)
      : undefined
  ),
  getProviderApiKey: vi.fn(async () => undefined),
  updateSession: providerMocks.updateSession
}));

vi.mock("../lib/providerClients", () => ({
  createConfiguredProvider: providerMocks.createConfiguredProvider
}));

describe("Practice", () => {
  afterEach(() => {
    providerMocks.createConfiguredProvider.mockReset();
    providerMocks.createSession.mockClear();
    providerMocks.addTranscript.mockClear();
    providerMocks.addPracticeScore.mockClear();
    providerMocks.updateSession.mockClear();
    cleanup();
  });

  it("loads plugin practice packs into interviewer mode", async () => {
    render(<Practice />);

    expect(await screen.findByRole("combobox", { name: "Practice pack" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Queue Interviews" })).toBeInTheDocument();
  });

  it("generates an AI interviewer follow-up from the configured provider", async () => {
    providerMocks.createConfiguredProvider.mockReturnValue({
      id: "ollama",
      label: "Ollama",
      kind: "local",
      healthCheck: vi.fn(async () => ({ ok: true, latencyMs: 1 })),
      chatStream: async function* () {
        yield "What storage tradeoff ";
        yield "would you make next?";
      }
    });
    const user = userEvent.setup();

    render(<Practice />);

    await user.type(await screen.findByRole("textbox", { name: "Your answer" }), "I would use queues and retries.");
    await user.click(screen.getByRole("button", { name: "Score Answer" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Follow-Up" }));

    expect(await screen.findByText("What storage tradeoff would you make next?")).toBeInTheDocument();
    expect(providerMocks.createConfiguredProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ollama" })
    );
  });

  it("saves a scored answer as a completed practice session", async () => {
    const user = userEvent.setup();

    render(<Practice />);

    await user.type(
      await screen.findByRole("textbox", { name: "Your answer" }),
      "I would gather requirements, add cache, queue analytics, and discuss storage tradeoffs."
    );
    await user.click(screen.getByRole("button", { name: "Score Answer" }));

    expect(await screen.findByText(/Saved practice score/)).toBeInTheDocument();
    expect(providerMocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        interviewType: "system_design",
        tags: ["practice", "system_design"]
      })
    );
    expect(providerMocks.addTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "practice-session-1",
        speaker: "interviewer"
      })
    );
    expect(providerMocks.addTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "practice-session-1",
        speaker: "candidate"
      })
    );
    expect(providerMocks.addPracticeScore).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "practice-session-1",
        questionId: "system-design-url-shortener",
        score: expect.any(Number)
      })
    );
    expect(providerMocks.updateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "practice-session-1",
        status: "completed"
      })
    );
  });
});
