import { describe, expect, it } from "vitest";
import { calculateSessionAnalytics } from "./analytics";

describe("analytics", () => {
  it("summarizes sessions, interviewer questions, and provider latency", () => {
    expect(
      calculateSessionAnalytics({
        sessions: [
          { id: "s1", title: "A", interviewType: "dsa", status: "completed", tags: [], totalTokens: 100, durationSeconds: 60, createdAt: "2026-05-20T00:00:00Z" }
        ],
        transcripts: [
          { id: 1, sessionId: "s1", speaker: "interviewer", content: "What is a heap?", timestampMs: 1000 },
          { id: 2, sessionId: "s1", speaker: "candidate", content: "A tree-based structure.", timestampMs: 2000 }
        ],
        responses: [
          { id: 1, sessionId: "s1", response: "Explain min/max heap.", model: "qwen", provider: "ollama", latencyMs: 800, createdAt: "2026-05-20T00:00:03Z" }
        ]
      })
    ).toEqual({
      totalSessions: 1,
      totalQuestions: 1,
      averageLatencyMs: 800,
      averageSessionMinutes: 1,
      providerCounts: { ollama: 1 }
    });
  });
});
