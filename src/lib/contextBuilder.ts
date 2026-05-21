import type { ChatMessage, PromptTemplate, Speaker, TranscriptSegment } from "../types/session";
import { estimateTokens } from "./sessionRuntime";

interface BuildChatMessagesInput {
  template: PromptTemplate;
  transcripts: TranscriptSegment[];
  resumeContext?: string;
  ocrContext?: string;
  knowledgeContext?: string;
  maxHistoryCharacters?: number;
  maxContextTokens?: number;
}

const DEFAULT_MAX_HISTORY_CHARACTERS = 6000;
const DEFAULT_MAX_CONTEXT_TOKENS = 1800;

export function buildChatMessages({
  template,
  transcripts,
  resumeContext,
  ocrContext,
  knowledgeContext,
  maxHistoryCharacters = DEFAULT_MAX_HISTORY_CHARACTERS,
  maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS
}: BuildChatMessagesInput): ChatMessage[] {
  const ordered = [...transcripts].sort((left, right) => left.timestampMs - right.timestampMs);
  const latestInterviewerQuestion = [...ordered]
    .reverse()
    .find((segment) => segment.speaker === "interviewer" && segment.content.trim().length > 0);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: template.systemPrompt.trim()
    }
  ];

  const trimmedResumeContext = resumeContext?.trim();
  if (trimmedResumeContext) {
    messages.push({
      role: "system",
      content: `Resume/JD context: ${trimmedResumeContext}`
    });
  }

  const trimmedOcrContext = ocrContext?.trim();
  if (trimmedOcrContext) {
    messages.push({
      role: "system",
      content: `Reviewed screen OCR context: ${trimmedOcrContext}`
    });
  }

  const trimmedKnowledgeContext = knowledgeContext?.trim();
  if (trimmedKnowledgeContext) {
    messages.push({
      role: "system",
      content: `Relevant knowledge base context:\n${trimmedKnowledgeContext}`
    });
  }

  const latestQuestionMessage = latestInterviewerQuestion
    ? {
        role: "user" as const,
        content: [
          `The interviewer just asked: ${latestInterviewerQuestion.content.trim()}`,
          "Respond with concise talking points, code only when useful, and avoid pretending to know facts not in context."
        ].join("\n")
      }
    : undefined;
  const fixedTokenCount = estimateMessageTokens(
    latestQuestionMessage ? [...messages, latestQuestionMessage] : messages
  );
  const historyTokenBudget = Math.max(0, maxContextTokens - fixedTokenCount);
  const boundedHistory = selectRecentHistory(ordered, maxHistoryCharacters, historyTokenBudget);

  for (const segment of boundedHistory) {
    messages.push({
      role: speakerToRole(segment.speaker),
      content: `[${speakerLabel(segment.speaker)}] ${segment.content.trim()}`
    });
  }

  if (latestQuestionMessage) {
    messages.push(latestQuestionMessage);
  }

  return messages;
}

function selectRecentHistory(
  transcripts: TranscriptSegment[],
  maxCharacters: number,
  maxTokens: number
): TranscriptSegment[] {
  const selected: TranscriptSegment[] = [];
  let characterCount = 0;
  let tokenCount = 0;

  for (const segment of [...transcripts].reverse()) {
    const content = segment.content.trim();
    if (!content) {
      continue;
    }

    const nextCount = characterCount + content.length;
    const messageContent = `[${speakerLabel(segment.speaker)}] ${content}`;
    const nextTokens = tokenCount + estimateTokens(messageContent);
    if (selected.length > 0 && (nextCount > maxCharacters || nextTokens > maxTokens)) {
      break;
    }

    if (nextCount > maxCharacters || nextTokens > maxTokens) {
      continue;
    }

    selected.push(segment);
    characterCount = nextCount;
    tokenCount = nextTokens;
  }

  return selected.reverse();
}

function estimateMessageTokens(messages: ChatMessage[]): number {
  return estimateTokens(messages.map((message) => message.content).join("\n"));
}

function speakerToRole(speaker: Speaker): ChatMessage["role"] {
  if (speaker === "candidate") {
    return "assistant";
  }

  return "user";
}

function speakerLabel(speaker: Speaker): string {
  if (speaker === "candidate") {
    return "YOU";
  }

  if (speaker === "interviewer") {
    return "INTERVIEWER";
  }

  return "UNKNOWN";
}
