export type InterviewType = "dsa" | "system_design" | "behavioral" | "hr" | "mixed";
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

export interface TranscriptSegment {
  id: number;
  sessionId: string;
  speaker: Speaker;
  content: string;
  timestampMs: number;
  confidence?: number;
  createdAt?: string;
}

export interface AIResponseRecord {
  id: number;
  sessionId: string;
  response: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  createdAt: string;
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

