import type { ChatMessage } from "./session";
import type { ProviderKind } from "./settings";

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface ChatStreamParams {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  pricing?: {
    inputPer1k: number;
    outputPer1k: number;
  };
}

export interface ProviderDescriptor {
  id: string;
  label: string;
  kind: ProviderKind;
}

