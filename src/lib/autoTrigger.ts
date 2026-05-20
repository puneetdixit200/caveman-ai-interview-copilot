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
