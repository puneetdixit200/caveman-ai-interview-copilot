import type { AIResponseRecord, SessionRecord, TranscriptSegment } from "../types/session";
import type { AppProfile, AudioDevice, ModelProviderConfig } from "../types/settings";

export const activeSession: SessionRecord = {
  id: "session-active",
  title: "Senior Backend Mock Interview",
  company: "Acme Systems",
  role: "Senior Software Engineer",
  interviewType: "system_design",
  tags: ["backend", "distributed-systems"],
  status: "active",
  modelUsed: "llama3.1:8b",
  provider: "ollama",
  totalTokens: 1420,
  durationSeconds: 1124,
  notes: "Focus on crisp trade-off language.",
  createdAt: "2026-05-19T18:30:00.000Z"
};

export const transcriptSegments: TranscriptSegment[] = [
  {
    id: 1,
    sessionId: activeSession.id,
    speaker: "interviewer",
    content: "Let's design a URL shortener. What requirements would you clarify first?",
    timestampMs: 4100,
    confidence: 0.98
  },
  {
    id: 2,
    sessionId: activeSession.id,
    speaker: "candidate",
    content: "I would clarify read/write ratio, retention, custom aliases, analytics, and expected scale.",
    timestampMs: 11420,
    confidence: 0.96
  },
  {
    id: 3,
    sessionId: activeSession.id,
    speaker: "interviewer",
    content: "Assume 100 million URLs and heavy read traffic. How would you generate unique short codes?",
    timestampMs: 24080,
    confidence: 0.97
  }
];

export const aiResponses: AIResponseRecord[] = [
  {
    id: 1,
    sessionId: activeSession.id,
    provider: "ollama",
    model: "llama3.1:8b",
    latencyMs: 820,
    response:
      "Use a 64-bit monotonically increasing ID from a Snowflake-style generator, then Base62 encode it. That gives compact, unique slugs without collision retries. Mention alternatives: random Base62 with collision check is simpler, but retry cost rises as the keyspace fills.",
    createdAt: "2026-05-19T18:31:20.000Z"
  }
];

export const historicalSessions: SessionRecord[] = [
  activeSession,
  {
    id: "session-2",
    title: "Frontend DSA Screen",
    company: "Northstar Labs",
    role: "Frontend Engineer",
    interviewType: "dsa",
    tags: ["react", "arrays"],
    status: "completed",
    modelUsed: "gpt-4o",
    provider: "openrouter",
    totalTokens: 3180,
    durationSeconds: 2760,
    createdAt: "2026-05-18T16:00:00.000Z",
    endedAt: "2026-05-18T16:46:00.000Z"
  },
  {
    id: "session-3",
    title: "Behavioral Practice",
    company: "Orbit Finance",
    role: "Staff Engineer",
    interviewType: "behavioral",
    tags: ["leadership", "conflict"],
    status: "archived",
    modelUsed: "claude-3.5-sonnet",
    provider: "anthropic",
    totalTokens: 2084,
    durationSeconds: 1900,
    createdAt: "2026-05-17T11:10:00.000Z"
  }
];

export const audioDevices: AudioDevice[] = [
  { id: "loopback-default", label: "System Output Loopback", kind: "system", selected: true, level: 0.66 },
  { id: "mic-default", label: "Primary Microphone", kind: "microphone", selected: true, level: 0.48 },
  { id: "vb-cable", label: "VB-Cable Virtual Input", kind: "virtual", selected: false, level: 0.12 }
];

export const modelProviders: ModelProviderConfig[] = [
  {
    id: "ollama",
    label: "Ollama",
    kind: "local",
    endpoint: "http://localhost:11434/api/chat",
    model: "llama3.1:8b",
    enabled: true,
    apiKeyStored: false
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "cloud",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4o-mini",
    enabled: true,
    apiKeyStored: true
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    kind: "local",
    endpoint: "http://localhost:1234/v1/chat/completions",
    model: "local-model",
    enabled: false,
    apiKeyStored: false
  }
];

export const profiles: AppProfile[] = [
  {
    id: "coding",
    name: "Coding Interview",
    interviewType: "dsa",
    providerId: "ollama",
    sttMode: "local_whisper",
    overlay: {
      opacity: 0.82,
      fontSize: 16,
      locked: false,
      hotkey: "Ctrl+Shift+H",
      autoHideOnScreenShare: true
    }
  },
  {
    id: "system-design",
    name: "System Design",
    interviewType: "system_design",
    providerId: "openrouter",
    sttMode: "deepgram",
    overlay: {
      opacity: 0.78,
      fontSize: 17,
      locked: true,
      hotkey: "Ctrl+Shift+H",
      autoHideOnScreenShare: true
    }
  }
];

