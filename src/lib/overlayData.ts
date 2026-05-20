import type { AIResponseRecord, SessionRecord } from "../types/session";

export function selectOverlaySession(sessions: SessionRecord[]): SessionRecord | undefined {
  return (
    sessions.find((session) => session.status === "active") ??
    [...sessions].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]
  );
}

export function sortOverlayResponses(responses: AIResponseRecord[]): AIResponseRecord[] {
  return [...responses].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}
