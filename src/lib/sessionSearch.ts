import type { SessionRecord } from "../types/session";

export interface FilterSessionSummariesInput {
  query: string;
  sessions: SessionRecord[];
  transcriptsBySession: Record<string, string[]>;
  responsesBySession: Record<string, string[]>;
}

export function filterSessionSummaries({
  query,
  sessions,
  transcriptsBySession,
  responsesBySession
}: FilterSessionSummariesInput): SessionRecord[] {
  const normalizedQuery = query.trim().toLowerCase();
  const newestFirst = [...sessions].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  if (!normalizedQuery) {
    return newestFirst;
  }

  return newestFirst.filter((session) =>
    [
      session.title,
      session.company,
      session.role,
      session.interviewType,
      session.status,
      session.notes ?? "",
      session.tags.join(" "),
      ...(transcriptsBySession[session.id] ?? []),
      ...(responsesBySession[session.id] ?? [])
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}
