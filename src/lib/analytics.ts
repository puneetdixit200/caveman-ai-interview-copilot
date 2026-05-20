import type { AIResponseRecord, SessionRecord, TranscriptSegment } from "../types/session";

export interface SessionAnalyticsInput {
  sessions: SessionRecord[];
  transcripts: TranscriptSegment[];
  responses: AIResponseRecord[];
}

export interface SessionAnalytics {
  totalSessions: number;
  totalQuestions: number;
  averageLatencyMs: number;
  averageSessionMinutes: number;
  providerCounts: Record<string, number>;
}

export function calculateSessionAnalytics(input: SessionAnalyticsInput): SessionAnalytics {
  const latencies = input.responses
    .map((response) => response.latencyMs)
    .filter((latency): latency is number => typeof latency === "number");
  const providerCounts: Record<string, number> = {};

  for (const response of input.responses) {
    providerCounts[response.provider] = (providerCounts[response.provider] ?? 0) + 1;
  }

  return {
    totalSessions: input.sessions.length,
    totalQuestions: input.transcripts.filter((segment) => segment.speaker === "interviewer").length,
    averageLatencyMs: average(latencies),
    averageSessionMinutes: average(input.sessions.map((session) => session.durationSeconds / 60)),
    providerCounts
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
