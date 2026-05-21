import type { AutoTriggerSettings } from "../types/settings";
import type { TranscriptSegment } from "../types/session";

export interface ShouldTriggerAnswerInput {
  segments: TranscriptSegment[];
  settings: AutoTriggerSettings;
  lastTriggeredTranscriptId?: number;
  nowMs: number;
}

export interface TriggerDecision {
  shouldTrigger: boolean;
  transcriptId?: number;
  reason?: "question" | "silence" | "continuous";
}

const QUESTION_STARTERS = [
  "what",
  "why",
  "how",
  "when",
  "where",
  "which",
  "who",
  "can",
  "could",
  "would",
  "should",
  "do",
  "does",
  "did",
  "tell",
  "explain",
  "design",
  "walk"
];

export function shouldTriggerAnswer({
  segments,
  settings,
  lastTriggeredTranscriptId,
  nowMs
}: ShouldTriggerAnswerInput): TriggerDecision {
  if (settings.mode === "manual") {
    return { shouldTrigger: false };
  }

  const latest = [...segments]
    .reverse()
    .find((segment) => segment.content.trim().length >= settings.minQuestionCharacters);
  if (!latest || latest.id === lastTriggeredTranscriptId) {
    return { shouldTrigger: false };
  }

  if (isDuplicateRecentQuestion(segments, latest, lastTriggeredTranscriptId, settings.duplicateWindowMs)) {
    return { shouldTrigger: false };
  }

  if (settings.requireInterviewerSpeaker && latest.speaker !== "interviewer") {
    return { shouldTrigger: false };
  }

  if (settings.mode === "continuous_coach") {
    return { shouldTrigger: true, transcriptId: latest.id, reason: "continuous" };
  }

  if (isExplicitQuestion(latest.content)) {
    return { shouldTrigger: true, transcriptId: latest.id, reason: "question" };
  }

  if (isQuestionLikePrompt(latest.content) && nowMs - latest.timestampMs >= settings.silenceTimeoutMs) {
    return { shouldTrigger: true, transcriptId: latest.id, reason: "silence" };
  }

  return { shouldTrigger: false };
}

function isExplicitQuestion(content: string): boolean {
  return content.trim().endsWith("?");
}

function isQuestionLikePrompt(content: string): boolean {
  const first = content.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return QUESTION_STARTERS.includes(first);
}

function isDuplicateRecentQuestion(
  segments: TranscriptSegment[],
  latest: TranscriptSegment,
  lastTriggeredTranscriptId: number | undefined,
  duplicateWindowMs: number
): boolean {
  if (!lastTriggeredTranscriptId || duplicateWindowMs <= 0) {
    return false;
  }

  const previous = segments.find((segment) => segment.id === lastTriggeredTranscriptId);
  if (!previous) {
    return false;
  }

  return (
    normalizeQuestionFingerprint(previous.content) === normalizeQuestionFingerprint(latest.content) &&
    Math.abs(latest.timestampMs - previous.timestampMs) <= duplicateWindowMs
  );
}

function normalizeQuestionFingerprint(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
