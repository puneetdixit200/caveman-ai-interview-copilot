export type InterviewType =
  | "dsa"
  | "system_design"
  | "frontend"
  | "backend"
  | "devops_cloud"
  | "behavioral"
  | "hr"
  | "mixed";
export type SessionStatus = "active" | "completed" | "archived";
export type Speaker = "interviewer" | "candidate" | "unknown";
export type ChatRole = "system" | "user" | "assistant";

export interface SessionRecord {
  id: string;
  title: string;
  company?: string;
  role?: string;
  interviewType: InterviewType;
  tags: string[];
  status: SessionStatus;
  modelUsed?: string;
  provider?: string;
  totalTokens: number;
  durationSeconds: number;
  notes?: string;
  createdAt: string;
  endedAt?: string;
}

export interface NewSessionInput {
  title: string;
  company?: string;
  role?: string;
  interviewType: InterviewType;
  tags: string[];
  notes?: string;
}

export interface UpdateSessionInput {
  id: string;
  title: string;
  company?: string;
  role?: string;
  interviewType: InterviewType;
  tags: string[];
  status: SessionStatus;
  notes?: string;
}

export interface TranscriptSegment {
  id: number;
  sessionId: string;
  speaker: Speaker;
  content: string;
  timestampMs: number;
  confidence?: number;
  createdAt?: string;
}

export interface TranscriptCursor {
  timestampMs: number;
  id: number;
}

export interface TranscriptPage {
  items: TranscriptSegment[];
  totalCount: number;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  previousCursor?: TranscriptCursor;
  nextCursor?: TranscriptCursor;
}

export interface SttTranscriptEvent {
  speaker: Speaker;
  providerSpeaker?: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
  language?: string;
}

export interface AIResponseRecord {
  id: number;
  sessionId: string;
  triggerTranscriptId?: number;
  promptMessages?: string;
  response: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  createdAt: string;
}

export interface PracticeScoreRecord {
  id: number;
  sessionId: string;
  questionId: string;
  question: string;
  answer: string;
  score: number;
  feedback: string;
  nextAction: string;
  matchedSignals: string[];
  createdAt: string;
}

export interface NewPracticeScoreInput {
  sessionId: string;
  questionId: string;
  question: string;
  answer: string;
  score: number;
  feedback: string;
  nextAction: string;
  matchedSignals: string[];
}

export interface NewAIResponseInput {
  sessionId: string;
  triggerTranscriptId?: number;
  promptMessages: string;
  response: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  category: InterviewType;
  systemPrompt: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
}
