import { describe, expect, it } from "vitest";
import { buildPracticeScoringPrompt, nextPracticeState } from "./practice";

describe("practice", () => {
  it("moves from asking to answered state with saved answer text", () => {
    expect(
      nextPracticeState(
        { status: "asking", question: "Explain indexes", answer: "", score: null },
        { type: "submit_answer", answer: "Indexes speed reads by trading write cost." }
      )
    ).toEqual({
      status: "answered",
      question: "Explain indexes",
      answer: "Indexes speed reads by trading write cost.",
      score: null
    });
  });

  it("builds a scoring prompt with a fixed rubric", () => {
    const prompt = buildPracticeScoringPrompt({
      interviewType: "system_design",
      question: "Design a notification system",
      answer: "Use queues and fanout workers."
    });

    expect(prompt).toContain("Score the candidate from 1-5");
    expect(prompt).toContain("clarity");
    expect(prompt).toContain("Design a notification system");
  });
});
