import type { InterviewType } from "../types/session";

export interface PracticeState {
  status: "asking" | "answered" | "scored";
  question: string;
  answer: string;
  score: number | null;
}

export type PracticeAction =
  | { type: "submit_answer"; answer: string }
  | { type: "apply_score"; score: number }
  | { type: "next_question"; question: string };

export function nextPracticeState(state: PracticeState, action: PracticeAction): PracticeState {
  if (action.type === "submit_answer") {
    return { ...state, status: "answered", answer: action.answer };
  }

  if (action.type === "apply_score") {
    return { ...state, status: "scored", score: clampScore(action.score) };
  }

  return { status: "asking", question: action.question, answer: "", score: null };
}

export function buildPracticeScoringPrompt(input: {
  interviewType: InterviewType;
  question: string;
  answer: string;
}): string {
  return [
    `Interview type: ${input.interviewType}`,
    "Score the candidate from 1-5 for clarity, correctness, structure, and missing points.",
    "Return concise feedback with one improvement action.",
    `Question: ${input.question}`,
    `Answer: ${input.answer}`
  ].join("\n");
}

function clampScore(score: number): number {
  return Math.min(5, Math.max(1, Math.round(score)));
}
