import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as tauri from "../lib/tauri";
import { Sessions } from "./Sessions";

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
  deleteTranscript: vi.fn(async () => undefined)
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
});
