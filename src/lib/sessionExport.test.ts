import { describe, expect, it } from "vitest";
import {
  buildSessionPdfLines,
  exportSessionJson,
  exportSessionMarkdown,
  sessionExportFilename
} from "./sessionExport";
import type { AIResponseRecord, SessionRecord, TranscriptSegment } from "../types/session";

describe("exportSessionMarkdown", () => {
  it("renders session metadata, transcripts, and AI responses as markdown", () => {
    const markdown = exportSessionMarkdown(makeExportInput());

    expect(markdown).toContain("# Backend Interview");
    expect(markdown).toContain("Company: Acme");
    expect(markdown).toContain("[00:05.000] INTERVIEWER: Design a URL shortener");
    expect(markdown).toContain("OpenRouter / gpt-4o");
    expect(markdown).toContain("Start with requirements and scale.");
  });

  it("renders a stable JSON export with session, transcript, and response records", () => {
    const json = exportSessionJson(makeExportInput());
    const parsed = JSON.parse(json);

    expect(parsed.exportVersion).toBe(1);
    expect(parsed.session.title).toBe("Backend Interview");
    expect(parsed.transcripts).toHaveLength(1);
    expect(parsed.responses[0].provider).toBe("openrouter");
    expect(json).toContain('\n  "session"');
  });

  it("builds PDF-safe session lines and filenames", () => {
    const input = makeExportInput();

    expect(buildSessionPdfLines(input)).toEqual(
      expect.arrayContaining([
        "Backend Interview",
        "Company: Acme",
        "[00:05.000] INTERVIEWER: Design a URL shortener",
        "OpenRouter / gpt-4o",
        "Start with requirements and scale."
      ])
    );
    expect(sessionExportFilename({ ...input.session, title: "Backend / Interview: Acme" }, "pdf")).toBe(
      "backend-interview-acme.pdf"
    );
  });
});

function makeExportInput(): {
  session: SessionRecord;
  transcripts: TranscriptSegment[];
  responses: AIResponseRecord[];
} {
  return {
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
      {
        id: 1,
        sessionId: "s1",
        speaker: "interviewer",
        content: "Design a URL shortener",
        timestampMs: 5000,
        confidence: 0.99
      }
    ],
    responses: [
      {
        id: 1,
        sessionId: "s1",
        response: "Start with requirements and scale.",
        model: "gpt-4o",
        provider: "openrouter",
        latencyMs: 710,
        createdAt: "2026-05-19T18:00:08Z"
      }
    ]
  };
}
