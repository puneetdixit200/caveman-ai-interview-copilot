import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  ])
}));

describe("Sessions", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows analytics for saved interview sessions", async () => {
    render(<Sessions />);

    const analyticsPanel = screen.getByRole("region", { name: "Session analytics" });

    expect(await within(analyticsPanel).findByText("Analytics")).toBeInTheDocument();
    expect(await within(analyticsPanel).findByText("1 question")).toBeInTheDocument();
    expect(await within(analyticsPanel).findByText("800ms avg latency")).toBeInTheDocument();
    expect(await within(analyticsPanel).findByText("ollama")).toBeInTheDocument();
  });
});
