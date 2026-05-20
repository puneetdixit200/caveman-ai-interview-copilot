import { describe, expect, it } from "vitest";
import { selectOverlaySession, sortOverlayResponses } from "./overlayData";
import type { AIResponseRecord, SessionRecord } from "../types/session";

describe("overlayData", () => {
  it("prefers the active session for the live overlay", () => {
    const sessions = [
      makeSession("old", "completed", "2026-05-20T08:00:00.000Z"),
      makeSession("active", "active", "2026-05-20T07:00:00.000Z")
    ];

    expect(selectOverlaySession(sessions)?.id).toBe("active");
  });

  it("falls back to the newest session and orders responses newest first", () => {
    const sessions = [
      makeSession("older", "completed", "2026-05-20T07:00:00.000Z"),
      makeSession("newer", "completed", "2026-05-20T09:00:00.000Z")
    ];
    const responses = [
      makeResponse(1, "2026-05-20T09:00:00.000Z"),
      makeResponse(2, "2026-05-20T09:01:00.000Z")
    ];

    expect(selectOverlaySession(sessions)?.id).toBe("newer");
    expect(sortOverlayResponses(responses).map((response) => response.id)).toEqual([2, 1]);
  });
});

function makeSession(id: string, status: SessionRecord["status"], createdAt: string): SessionRecord {
  return {
    id,
    title: id,
    company: "",
    role: "",
    interviewType: "system_design",
    tags: [],
    status,
    totalTokens: 0,
    durationSeconds: 0,
    notes: "",
    createdAt
  };
}

function makeResponse(id: number, createdAt: string): AIResponseRecord {
  return {
    id,
    sessionId: "session",
    provider: "ollama",
    model: "llama3.1:8b",
    response: `response ${id}`,
    latencyMs: 10,
    createdAt
  };
}
