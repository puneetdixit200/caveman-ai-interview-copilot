import { describe, expect, it } from "vitest";
import {
  buildPracticeScoringPrompt,
  buildPracticeFollowUpMessages,
  listPluginPracticeQuestions,
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

  it("builds AI interviewer follow-up messages from the candidate answer", () => {
    const messages = buildPracticeFollowUpMessages({
      interviewType: "system_design",
      question: "Design a notification system",
      answer: "I would use queues and fanout workers with retries.",
      score: 4
    });

    expect(messages).toEqual([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("senior technical interviewer")
      }),
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Design a notification system")
      })
    ]);
    expect(messages[1].content).toContain("queues and fanout workers");
    expect(messages[1].content).toContain("Score: 4/5");
  });

  it("serves a typed practice question bank", () => {
    const questions = listPracticeQuestions("system_design");

    expect(questions.length).toBeGreaterThan(1);
    expect(questions[0]).toMatchObject({
      interviewType: "system_design",
      focus: expect.arrayContaining(["requirements"])
    });
  });

  it("includes built-in practice coverage for frontend, backend, and DevOps interviews", () => {
    expect(listPracticeQuestions("frontend")[0]).toMatchObject({
      interviewType: "frontend",
      focus: expect.arrayContaining(["accessibility"])
    });
    expect(listPracticeQuestions("backend")[0]).toMatchObject({
      interviewType: "backend",
      focus: expect.arrayContaining(["reliability"])
    });
    expect(listPracticeQuestions("devops_cloud")[0]).toMatchObject({
      interviewType: "devops_cloud",
      focus: expect.arrayContaining(["observability"])
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

  it("converts plugin practice packs into typed interviewer questions", () => {
    const questions = listPluginPracticeQuestions(
      [
        {
          id: "queues-pack",
          name: "Queue Interviews",
          interviewType: "system_design",
          questions: [
            {
              id: "dead-letter",
              prompt: "Design dead-letter queue handling.",
              expectedSignals: ["retry", "backoff", "alert"]
            }
          ]
        }
      ],
      "system_design"
    );

    expect(questions).toEqual([
      {
        id: "queues-pack:dead-letter",
        interviewType: "system_design",
        question: "Design dead-letter queue handling.",
        focus: ["Queue Interviews"],
        expectedSignals: ["retry", "backoff", "alert"]
      }
    ]);
  });
});
