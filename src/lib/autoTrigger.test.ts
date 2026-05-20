import { describe, expect, it } from "vitest";
import { shouldTriggerAnswer } from "./autoTrigger";
import type { AutoTriggerSettings } from "../types/settings";
import type { TranscriptSegment } from "../types/session";

const settings: AutoTriggerSettings = {
  mode: "suggest_on_question",
  silenceTimeoutMs: 1200,
  duplicateWindowMs: 30000,
  minQuestionCharacters: 12,
  requireInterviewerSpeaker: true
};

describe("autoTrigger", () => {
  it("triggers once for a new interviewer question", () => {
    const segments: TranscriptSegment[] = [
      { id: 11, sessionId: "s1", speaker: "interviewer", content: "How would you design a rate limiter?", timestampMs: 1000, confidence: 0.95 }
    ];

    expect(shouldTriggerAnswer({ segments, settings, lastTriggeredTranscriptId: undefined, nowMs: 1400 })).toEqual({
      shouldTrigger: true,
      transcriptId: 11,
      reason: "question"
    });
  });

  it("suppresses candidate speech and duplicate transcript ids", () => {
    expect(
      shouldTriggerAnswer({
        segments: [
          { id: 12, sessionId: "s1", speaker: "candidate", content: "Can I clarify the constraints?", timestampMs: 2000, confidence: 0.95 }
        ],
        settings,
        nowMs: 2400
      }).shouldTrigger
    ).toBe(false);

    expect(
      shouldTriggerAnswer({
        segments: [
          { id: 11, sessionId: "s1", speaker: "interviewer", content: "How would you design a rate limiter?", timestampMs: 1000, confidence: 0.95 }
        ],
        settings,
        lastTriggeredTranscriptId: 11,
        nowMs: 2000
      }).shouldTrigger
    ).toBe(false);
  });

  it("can trigger after interviewer silence for question-like prompts without punctuation", () => {
    expect(
      shouldTriggerAnswer({
        segments: [
          { id: 13, sessionId: "s1", speaker: "interviewer", content: "Tell me about your last migration project", timestampMs: 1000, confidence: 0.94 }
        ],
        settings,
        nowMs: 2600
      })
    ).toEqual({ shouldTrigger: true, transcriptId: 13, reason: "silence" });
  });
});
