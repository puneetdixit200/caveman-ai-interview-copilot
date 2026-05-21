import { describe, expect, it } from "vitest";
import { buildChatMessages } from "./contextBuilder";
import { estimateTokens } from "./sessionRuntime";
import type { PromptTemplate, TranscriptSegment } from "../types/session";

const template: PromptTemplate = {
  id: "dsa",
  name: "DSA Interview",
  category: "dsa",
  systemPrompt: "Answer like a concise senior interview coach."
};

describe("buildChatMessages", () => {
  it("places system, resume, trimmed history, and latest interviewer question in model order", () => {
    const history: TranscriptSegment[] = [
      { id: 1, sessionId: "s1", speaker: "candidate", content: "I mostly use TypeScript.", timestampMs: 1000, confidence: 0.95 },
      { id: 2, sessionId: "s1", speaker: "interviewer", content: "Explain HashMap internals.", timestampMs: 2000, confidence: 0.98 }
    ];

    const messages = buildChatMessages({
      template,
      resumeContext: "Candidate has backend and React experience.",
      transcripts: history,
      maxHistoryCharacters: 200
    });

    expect(messages).toEqual([
      { role: "system", content: "Answer like a concise senior interview coach." },
      { role: "system", content: "Resume/JD context: Candidate has backend and React experience." },
      { role: "assistant", content: "[YOU] I mostly use TypeScript." },
      { role: "user", content: "[INTERVIEWER] Explain HashMap internals." },
      { role: "user", content: "The interviewer just asked: Explain HashMap internals.\nRespond with concise talking points, code only when useful, and avoid pretending to know facts not in context." }
    ]);
  });

  it("keeps the most recent transcript content when the history window is constrained", () => {
    const messages = buildChatMessages({
      template,
      transcripts: [
        { id: 1, sessionId: "s1", speaker: "interviewer", content: "Old setup question that should fall out.", timestampMs: 1000, confidence: 0.91 },
        { id: 2, sessionId: "s1", speaker: "candidate", content: "A short answer.", timestampMs: 2000, confidence: 0.92 },
        { id: 3, sessionId: "s1", speaker: "interviewer", content: "New important question?", timestampMs: 3000, confidence: 0.93 }
      ],
      maxHistoryCharacters: 42
    });

    expect(messages.some((message) => message.content.includes("Old setup"))).toBe(false);
    expect(messages.some((message) => message.content.includes("New important question?"))).toBe(true);
  });

  it("includes reviewed screen OCR context when provided", () => {
    const messages = buildChatMessages({
      template,
      transcripts: [
        {
          id: 1,
          sessionId: "s1",
          speaker: "interviewer",
          content: "Can you solve what is on screen?",
          timestampMs: 1000,
          confidence: 0.9
        }
      ],
      ocrContext: "LeetCode 146 LRU Cache"
    });

    expect(messages).toContainEqual({
      role: "system",
      content: "Reviewed screen OCR context: LeetCode 146 LRU Cache"
    });
  });

  it("includes ranked knowledge base context when provided", () => {
    const messages = buildChatMessages({
      template,
      transcripts: [
        {
          id: 1,
          sessionId: "s1",
          speaker: "interviewer",
          content: "How did you implement retries?",
          timestampMs: 1000,
          confidence: 0.9
        }
      ],
      knowledgeContext: "project: Payments\nStripe webhook retries used queue backoff."
    });

    expect(messages).toContainEqual({
      role: "system",
      content: "Relevant knowledge base context:\nproject: Payments\nStripe webhook retries used queue backoff."
    });
  });

  it("keeps prompt messages inside a token budget by dropping oldest transcript turns first", () => {
    const messages = buildChatMessages({
      template,
      transcripts: [
        {
          id: 1,
          sessionId: "s1",
          speaker: "interviewer",
          content: `Old background ${"architecture ".repeat(80)}`,
          timestampMs: 1000,
          confidence: 0.9
        },
        {
          id: 2,
          sessionId: "s1",
          speaker: "candidate",
          content: "Recent answer used queues.",
          timestampMs: 2000,
          confidence: 0.9
        },
        {
          id: 3,
          sessionId: "s1",
          speaker: "interviewer",
          content: "How would you prevent duplicate jobs?",
          timestampMs: 3000,
          confidence: 0.9
        }
      ],
      maxHistoryCharacters: 20_000,
      maxContextTokens: 70
    });

    const totalTokens = estimateTokens(messages.map((message) => message.content).join("\n"));

    expect(totalTokens).toBeLessThanOrEqual(70);
    expect(messages.some((message) => message.content.includes("Old background"))).toBe(false);
    expect(messages.some((message) => message.content.includes("Recent answer used queues."))).toBe(true);
    expect(messages.at(-1)?.content).toContain("How would you prevent duplicate jobs?");
  });
});
