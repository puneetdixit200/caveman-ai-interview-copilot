import { describe, expect, it } from "vitest";
import { filterSessionSummaries } from "./sessionSearch";
import type { SessionRecord } from "../types/session";

describe("filterSessionSummaries", () => {
  it("searches session metadata, transcript text, response text, and notes", () => {
    const sessions = [
      makeSession("s1", "Backend Interview", "Acme", "Senior Engineer", ["backend"]),
      makeSession("s2", "Frontend Interview", "Bright", "UI Engineer", ["react"])
    ];

    const result = filterSessionSummaries({
      query: "rate limiter",
      sessions,
      transcriptsBySession: {
        s1: ["How would you design a rate limiter?"],
        s2: ["Explain CSS containment."]
      },
      responsesBySession: {
        s1: ["Use token buckets and per-user keys."],
        s2: ["Discuss layout and paint costs."]
      }
    });

    expect(result.map((session) => session.id)).toEqual(["s1"]);
  });

  it("returns sessions newest first when query is empty", () => {
    const result = filterSessionSummaries({
      query: " ",
      sessions: [
        makeSession("older", "Older", "", "", [], "2026-05-20T08:00:00.000Z"),
        makeSession("newer", "Newer", "", "", [], "2026-05-20T09:00:00.000Z")
      ],
      transcriptsBySession: {},
      responsesBySession: {}
    });

    expect(result.map((session) => session.id)).toEqual(["newer", "older"]);
  });
});

function makeSession(
  id: string,
  title: string,
  company: string,
  role: string,
  tags: string[],
  createdAt = "2026-05-20T08:00:00.000Z"
): SessionRecord {
  return {
    id,
    title,
    company,
    role,
    interviewType: "system_design",
    tags,
    status: "completed",
    totalTokens: 0,
    durationSeconds: 0,
    notes: id === "s1" ? "Follow up on distributed systems depth." : "",
    createdAt
  };
}
