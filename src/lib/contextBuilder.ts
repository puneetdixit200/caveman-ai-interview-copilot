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
  maxStaticContextTokens?: number;
  maxHistoryTurns?: number;
}

const DEFAULT_MAX_HISTORY_CHARACTERS = 6000;
const DEFAULT_MAX_CONTEXT_TOKENS = 1800;
const DEFAULT_MAX_STATIC_CONTEXT_TOKENS = 700;
const DEFAULT_MAX_HISTORY_TURNS = 40;

export function buildChatMessages({
  template,
  transcripts,
  resumeContext,
  ocrContext,
  knowledgeContext,
  maxHistoryCharacters = DEFAULT_MAX_HISTORY_CHARACTERS,
  maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS,
  maxStaticContextTokens = DEFAULT_MAX_STATIC_CONTEXT_TOKENS,
  maxHistoryTurns = DEFAULT_MAX_HISTORY_TURNS
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

  const latestQuestionMessage = latestInterviewerQuestion
    ? {
        role: "user" as const,
        content: [
          `The interviewer just asked: ${latestInterviewerQuestion.content.trim()}`,
          "Respond with concise talking points, code only when useful, and avoid pretending to know facts not in context."
        ].join("\n")
      }
    : undefined;
  messages.push(
    ...buildSupplementalContextMessages({
      resumeContext,
      ocrContext,
      knowledgeContext,
      maxContextTokens,
      maxStaticContextTokens,
      fixedMessages: latestQuestionMessage ? [...messages, latestQuestionMessage] : messages
    })
  );

  const fixedTokenCount = estimateMessageTokens(
    latestQuestionMessage ? [...messages, latestQuestionMessage] : messages
  );
  const historyTokenBudget = Math.max(0, maxContextTokens - fixedTokenCount);
  const { segments: boundedHistory, omittedCount } = selectRecentHistory(
    ordered,
    maxHistoryCharacters,
    historyTokenBudget,
    maxHistoryTurns
  );
  const historyMessages: ChatMessage[] = boundedHistory.map((segment) => ({
    role: speakerToRole(segment.speaker),
    content: `[${speakerLabel(segment.speaker)}] ${segment.content.trim()}`
  }));
  const omissionMessage = omittedCount > 0 ? buildOmissionMessage(omittedCount) : undefined;

  if (
    omissionMessage &&
    estimateMessageTokens(latestQuestionMessage ? [...messages, omissionMessage, ...historyMessages, latestQuestionMessage] : [...messages, omissionMessage, ...historyMessages]) <=
      maxContextTokens
  ) {
    messages.push(omissionMessage);
  }

  messages.push(...historyMessages);

  if (latestQuestionMessage) {
    messages.push(latestQuestionMessage);
  }

  return messages;
}

function selectRecentHistory(
  transcripts: TranscriptSegment[],
  maxCharacters: number,
  maxTokens: number,
  maxTurns: number
): { segments: TranscriptSegment[]; omittedCount: number } {
  const nonEmpty = transcripts.filter((segment) => segment.content.trim());
  const turnLimited = nonEmpty.slice(-Math.max(0, maxTurns));
  const selected: TranscriptSegment[] = [];
  let characterCount = 0;
  let tokenCount = 0;

  for (const segment of [...turnLimited].reverse()) {
    const content = segment.content.trim();
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

  const segments = selected.reverse();
  return {
    segments,
    omittedCount: Math.max(0, nonEmpty.length - segments.length)
  };
}

function estimateMessageTokens(messages: ChatMessage[]): number {
  return estimateTokens(messages.map((message) => message.content).join("\n"));
}

function buildSupplementalContextMessages({
  resumeContext,
  ocrContext,
  knowledgeContext,
  maxContextTokens,
  maxStaticContextTokens,
  fixedMessages
}: {
  resumeContext?: string;
  ocrContext?: string;
  knowledgeContext?: string;
  maxContextTokens: number;
  maxStaticContextTokens: number;
  fixedMessages: ChatMessage[];
}): ChatMessage[] {
  const availableStaticTokens = Math.max(
    0,
    Math.min(maxStaticContextTokens, maxContextTokens - estimateMessageTokens(fixedMessages))
  );
  const entries = [
    { prefix: "Resume/JD context: ", content: resumeContext },
    { prefix: "Reviewed screen OCR context: ", content: ocrContext },
    { prefix: "Relevant knowledge base context:\n", content: knowledgeContext }
  ];
  const messages: ChatMessage[] = [];
  let usedTokens = 0;

  for (const entry of entries) {
    const remainingTokens = availableStaticTokens - usedTokens;
    const content = entry.content?.trim();
    if (!content || remainingTokens <= 0) {
      continue;
    }

    const packed = packTextIntoTokenBudget(entry.prefix, content, remainingTokens);
    if (!packed) {
      continue;
    }

    messages.push({ role: "system", content: packed });
    usedTokens += estimateTokens(packed);
  }

  return messages;
}

function packTextIntoTokenBudget(prefix: string, text: string, tokenBudget: number): string | undefined {
  const fullContent = `${prefix}${text}`;
  if (estimateTokens(fullContent) <= tokenBudget) {
    return fullContent;
  }

  const suffix = "\n[truncated to fit token budget]";
  const words = text.split(/\s+/).filter(Boolean);
  let low = 0;
  let high = words.length;
  let best = "";

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate = `${prefix}${words.slice(0, midpoint).join(" ")}${suffix}`;
    if (estimateTokens(candidate) <= tokenBudget) {
      best = candidate;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return best || undefined;
}

function buildOmissionMessage(omittedCount: number): ChatMessage {
  return {
    role: "system",
    content: `Context window note: omitted ${omittedCount} older transcript turn${
      omittedCount === 1 ? "" : "s"
    } to stay within the configured token budget.`
  };
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
