import { describe, expect, it } from "vitest";
import { exportSessionMarkdown } from "./sessionExport";

describe("exportSessionMarkdown", () => {
  it("renders session metadata, transcripts, and AI responses as markdown", () => {
    const markdown = exportSessionMarkdown({
      session: {
        id: "s1",
        title: "Backend Interview",
        company: "Acme",
        role: "Senior Engineer",
        interviewType: "system_design",
        tags: ["backend", "distributed"],
        status: "completed",
        totalTokens: 320,
        durationSeconds: 900,
        createdAt: "2026-05-19T18:00:00Z"
      },
      transcripts: [
        { id: 1, sessionId: "s1", speaker: "interviewer", content: "Design a URL shortener", timestampMs: 5000, confidence: 0.99 }
      ],
      responses: [
        { id: 1, sessionId: "s1", response: "Start with requirements and scale.", model: "gpt-4o", provider: "openrouter", latencyMs: 710, createdAt: "2026-05-19T18:00:08Z" }
      ]
    });

    expect(markdown).toContain("# Backend Interview");
    expect(markdown).toContain("Company: Acme");
    expect(markdown).toContain("[00:05.000] INTERVIEWER: Design a URL shortener");
    expect(markdown).toContain("OpenRouter / gpt-4o");
    expect(markdown).toContain("Start with requirements and scale.");
  });
});

