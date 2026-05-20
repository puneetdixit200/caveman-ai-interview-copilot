import { describe, expect, it } from "vitest";
import {
  buildPracticeScoringPrompt,
  listPracticeQuestions,
  nextPracticeState,
  scorePracticeAnswer
} from "./practice";

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

  it("serves a typed practice question bank", () => {
    const questions = listPracticeQuestions("system_design");

    expect(questions.length).toBeGreaterThan(1);
    expect(questions[0]).toMatchObject({
      interviewType: "system_design",
      focus: expect.arrayContaining(["requirements"])
    });
  });

  it("scores an answer locally with actionable feedback", () => {
    const question = listPracticeQuestions("system_design")[0];
    const feedback = scorePracticeAnswer({
      question,
      answer: "I would clarify requirements, estimate scale, define APIs, then discuss storage, queues, cache, and tradeoffs."
    });

    expect(feedback.score).toBeGreaterThanOrEqual(4);
    expect(feedback.feedback).toContain("Covered");
    expect(feedback.nextAction.length).toBeGreaterThan(10);
  });
});
