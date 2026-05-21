import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLUGIN_CATALOG_SETTING_KEY, serializePluginCatalog } from "../lib/pluginLoader";
import * as tauri from "../lib/tauri";
import { Sessions } from "./Sessions";

const firstTranscriptPage = {
  items: [
    {
      id: 1,
      sessionId: "s1",
      speaker: "interviewer",
      content: "How would you design retries?",
      timestampMs: 1000,
      confidence: 0.9
    }
  ],
  totalCount: 2,
  hasMoreBefore: false,
  hasMoreAfter: true,
  previousCursor: { timestampMs: 1000, id: 1 },
  nextCursor: { timestampMs: 1000, id: 1 }
};

const secondTranscriptPage = {
  items: [
    {
      id: 2,
      sessionId: "s1",
      speaker: "candidate",
      content: "I would use idempotency keys.",
      timestampMs: 2500,
      confidence: 0.88
    }
  ],
  totalCount: 2,
  hasMoreBefore: true,
  hasMoreAfter: false,
  previousCursor: { timestampMs: 2500, id: 2 },
  nextCursor: { timestampMs: 2500, id: 2 }
};

vi.mock("../lib/tauri", () => ({
  listSessions: vi.fn(async () => [
    {
      id: "s1",
      title: "Stripe Interview",
      company: "Stripe",
      role: "Backend Engineer",
      interviewType: "system_design",
      tags: ["onsite"],
      status: "completed",
      totalTokens: 100,
      durationSeconds: 120,
      createdAt: "2026-05-20T00:00:00.000Z"
    }
  ]),
  listTranscripts: vi.fn(async () => [
    {
      id: 1,
      sessionId: "s1",
      speaker: "interviewer",
      content: "How would you design retries?",
      timestampMs: 1000,
      confidence: 0.9
    }
  ]),
  listTranscriptPage: vi.fn(async (sessionId, options = {}) =>
    sessionId === "s1" && options.direction === "after" ? secondTranscriptPage : firstTranscriptPage
  ),
  listAiResponses: vi.fn(async () => [
    {
      id: 1,
      sessionId: "s1",
      response: "Use idempotency keys.",
      model: "llama3.1:8b",
      provider: "ollama",
      latencyMs: 800,
      createdAt: "2026-05-20T00:00:02.000Z"
    }
  ]),
  updateTranscript: vi.fn(async (input) => ({
    id: input.id,
    sessionId: "s1",
    speaker: input.speaker,
    content: input.content,
    timestampMs: input.timestampMs,
    confidence: input.confidence,
    createdAt: "2026-05-20T00:00:01.000Z"
  })),
  deleteTranscript: vi.fn(async () => undefined),
  getSetting: vi.fn(async () => undefined)
}));

describe("Sessions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows analytics for saved interview sessions", async () => {
    render(<Sessions />);

    const analyticsPanel = screen.getByRole("region", { name: "Session analytics" });

    expect(await within(analyticsPanel).findByText("Analytics")).toBeInTheDocument();
    expect(await within(analyticsPanel).findByText("1 question")).toBeInTheDocument();
    expect(await within(analyticsPanel).findByText("800ms avg latency")).toBeInTheDocument();
    expect(await within(analyticsPanel).findByText("ollama")).toBeInTheDocument();
  });

  it("lets saved transcript lines be corrected and deleted from replay", async () => {
    const user = userEvent.setup();
    render(<Sessions />);

    expect(await screen.findByText("How would you design retries?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit transcript line 1" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Speaker for transcript line 1" }), "candidate");
    const transcriptText = screen.getByRole("textbox", { name: "Transcript text for line 1" });
    await user.clear(transcriptText);
    await user.type(transcriptText, "I would design retry budgets.");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Timestamp ms for transcript line 1" }), {
      target: { value: "2400" }
    });

    await user.click(screen.getByRole("button", { name: "Save transcript line 1" }));

    expect(tauri.updateTranscript).toHaveBeenCalledWith({
      id: 1,
      speaker: "candidate",
      content: "I would design retry budgets.",
      timestampMs: 2400,
      confidence: 0.9
    });
    expect(await screen.findByText("I would design retry budgets.")).toBeInTheDocument();
    expect(screen.getByText("Transcript correction saved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete transcript line 1" }));

    expect(tauri.deleteTranscript).toHaveBeenCalledWith(1);
    expect(screen.queryByText("I would design retry budgets.")).not.toBeInTheDocument();
    expect(screen.getByText("Transcript line deleted")).toBeInTheDocument();
  });

  it("pages through long transcript replays with cursor navigation", async () => {
    const user = userEvent.setup();
    render(<Sessions />);

    expect(await screen.findByText("How would you design retries?")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 transcript line of 2")).toBeInTheDocument();
    expect(tauri.listTranscriptPage).toHaveBeenCalledWith("s1", { limit: 100 });

    await user.click(screen.getByRole("button", { name: "Next transcript page" }));

    expect(await screen.findByText("I would use idempotency keys.")).toBeInTheDocument();
    expect(screen.queryByText("How would you design retries?")).not.toBeInTheDocument();
    expect(tauri.listTranscriptPage).toHaveBeenCalledWith("s1", {
      cursor: { timestampMs: 1000, id: 1 },
      direction: "after",
      limit: 100
    });

    await user.click(screen.getByRole("button", { name: "Previous transcript page" }));

    expect(await screen.findByText("How would you design retries?")).toBeInTheDocument();
    expect(tauri.listTranscriptPage).toHaveBeenCalledWith("s1", {
      cursor: { timestampMs: 2500, id: 2 },
      direction: "before",
      limit: 100
    });
  });

  it("copies plugin-defined session exports from the archive", async () => {
    vi.mocked(tauri.getSetting).mockImplementation(async (key: string) =>
      key === PLUGIN_CATALOG_SETTING_KEY
        ? serializePluginCatalog({
            loaded: [],
            errors: [],
            promptTemplates: [],
            exportFormats: [],
            exportTemplates: [
              {
                id: "interview-brief",
                name: "Interview Brief",
                fileExtension: "txt",
                contentTemplate: "Brief: {{session.title}}\n{{transcript.plain}}\n{{responses.plain}}"
              }
            ],
            practicePacks: []
          })
        : undefined
    );
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(<Sessions />);

    expect((await screen.findAllByText("Stripe Interview")).length).toBeGreaterThan(0);
    await user.click(await screen.findByRole("button", { name: "Copy Interview Brief" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Brief: Stripe Interview")));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("INTERVIEWER: How would you design retries?"));
    expect(await screen.findByText("Interview Brief export copied")).toBeInTheDocument();
  });
});
