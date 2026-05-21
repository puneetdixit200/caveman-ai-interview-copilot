import type { ChatMessage, InterviewType } from "../types/session";
import type { PluginPracticePack } from "./pluginManifest";

export interface PracticeQuestion {
  id: string;
  interviewType: InterviewType;
  question: string;
  focus: string[];
  expectedSignals: string[];
}

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

export function buildPracticeFollowUpMessages(input: {
  interviewType: InterviewType;
  question: string;
  answer: string;
  score?: number | null;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are a senior technical interviewer running a realistic practice interview.",
        "Ask exactly one concise follow-up question that probes the weakest missing detail.",
        "Do not answer the question yourself."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        `Interview type: ${input.interviewType}`,
        `Original question: ${input.question}`,
        input.score ? `Score: ${input.score}/5` : "Score: not available",
        `Candidate answer: ${input.answer}`,
        "Generate the next interviewer follow-up question."
      ].join("\n")
    }
  ];
}

export const practiceQuestions: PracticeQuestion[] = [
  {
    id: "system-design-url-shortener",
    interviewType: "system_design",
    question: "Design a URL shortener for heavy read traffic.",
    focus: ["requirements", "scale", "storage"],
    expectedSignals: ["requirements", "scale", "api", "storage", "cache", "queue", "tradeoff"]
  },
  {
    id: "system-design-notifications",
    interviewType: "system_design",
    question: "Design a notification system that supports email, SMS, and push.",
    focus: ["fanout", "retries", "delivery guarantees"],
    expectedSignals: ["requirements", "queue", "retry", "template", "preference", "provider", "idempotency"]
  },
  {
    id: "dsa-heap",
    interviewType: "dsa",
    question: "Explain how a heap works and when you would use one.",
    focus: ["complexity", "operations", "use cases"],
    expectedSignals: ["complete tree", "insert", "extract", "heapify", "priority queue", "log"]
  },
  {
    id: "behavioral-conflict",
    interviewType: "behavioral",
    question: "Tell me about a time you handled a conflict with another engineer.",
    focus: ["situation", "action", "result"],
    expectedSignals: ["context", "stakeholder", "action", "tradeoff", "result", "learned"]
  },
  {
    id: "hr-strengths",
    interviewType: "hr",
    question: "What strengths would you bring to this role?",
    focus: ["evidence", "role fit", "impact"],
    expectedSignals: ["example", "impact", "team", "role", "growth"]
  },
  {
    id: "mixed-debugging",
    interviewType: "mixed",
    question: "A production endpoint suddenly becomes slow. Walk through your debugging approach.",
    focus: ["triage", "metrics", "mitigation"],
    expectedSignals: ["metrics", "logs", "trace", "rollback", "cache", "database", "communication"]
  }
];

export function listPracticeQuestions(interviewType: InterviewType): PracticeQuestion[] {
  const matching = practiceQuestions.filter(
    (question) => question.interviewType === interviewType || question.interviewType === "mixed"
  );

  return matching.length > 0 ? matching : practiceQuestions;
}

export function listPluginPracticeQuestions(
  packs: PluginPracticePack[],
  interviewType: InterviewType,
  packId?: string
): PracticeQuestion[] {
  return packs
    .filter((pack) => (packId ? pack.id === packId : pack.interviewType === interviewType || pack.interviewType === "mixed"))
    .flatMap((pack) =>
      pack.questions.map((question) => ({
        id: `${pack.id}:${question.id}`,
        interviewType: pack.interviewType,
        question: question.prompt,
        focus: [pack.name],
        expectedSignals: question.expectedSignals
      }))
    );
}

export function scorePracticeAnswer(input: { question: PracticeQuestion; answer: string }): {
  score: number;
  feedback: string;
  nextAction: string;
  matchedSignals: string[];
} {
  const normalizedAnswer = input.answer.toLowerCase();
  const matchedSignals = input.question.expectedSignals.filter((signal) => normalizedAnswer.includes(signal));
  const wordCount = input.answer.trim().split(/\s+/).filter(Boolean).length;
  const lengthBonus = wordCount >= 25 ? 1 : 0;
  const score = clampScore(1 + matchedSignals.length * 0.65 + lengthBonus);
  const missingSignals = input.question.expectedSignals.filter((signal) => !matchedSignals.includes(signal)).slice(0, 3);

  return {
    score,
    feedback:
      matchedSignals.length > 0
        ? `Covered ${matchedSignals.join(", ")}.`
        : "Answer was too general for the selected interview focus.",
    nextAction:
      missingSignals.length > 0
        ? `Add concrete detail on ${missingSignals.join(", ")} before moving to tradeoffs.`
        : "Tighten the opening summary and quantify the highest-risk tradeoff.",
    matchedSignals
  };
}

function clampScore(score: number): number {
  return Math.min(5, Math.max(1, Math.round(score)));
}
