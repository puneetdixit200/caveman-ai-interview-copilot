import type { AIResponseRecord } from "../types/session";

export interface CodeBlock {
  language: string;
  code: string;
}

export interface CodeSuggestion extends CodeBlock {
  responseId: number;
  provider: string;
  model: string;
  createdAt: string;
}

export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const pattern = /```([A-Za-z0-9_-]*)\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push({
      language: match[1]?.trim() || "text",
      code: match[2].trim()
    });
  }

  return blocks;
}

export function extractCodeSuggestions(responses: AIResponseRecord[]): CodeSuggestion[] {
  return responses.flatMap((response) =>
    extractCodeBlocks(response.response).map((block) => ({
      ...block,
      responseId: response.id,
      provider: response.provider,
      model: response.model,
      createdAt: response.createdAt
    }))
  );
}
