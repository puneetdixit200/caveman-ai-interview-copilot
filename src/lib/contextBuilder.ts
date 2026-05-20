import type { ChatMessage, PromptTemplate, Speaker, TranscriptSegment } from "../types/session";

interface BuildChatMessagesInput {
  template: PromptTemplate;
  transcripts: TranscriptSegment[];
  resumeContext?: string;
  ocrContext?: string;
  knowledgeContext?: string;
  maxHistoryCharacters?: number;
}

const DEFAULT_MAX_HISTORY_CHARACTERS = 6000;

export function buildChatMessages({
  template,
  transcripts,
  resumeContext,
  ocrContext,
  knowledgeContext,
  maxHistoryCharacters = DEFAULT_MAX_HISTORY_CHARACTERS
}: BuildChatMessagesInput): ChatMessage[] {
  const ordered = [...transcripts].sort((left, right) => left.timestampMs - right.timestampMs);
  const boundedHistory = selectRecentHistory(ordered, maxHistoryCharacters);
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

  for (const segment of boundedHistory) {
    messages.push({
      role: speakerToRole(segment.speaker),
      content: `[${speakerLabel(segment.speaker)}] ${segment.content.trim()}`
    });
  }

  if (latestInterviewerQuestion) {
    messages.push({
      role: "user",
      content: [
        `The interviewer just asked: ${latestInterviewerQuestion.content.trim()}`,
        "Respond with concise talking points, code only when useful, and avoid pretending to know facts not in context."
      ].join("\n")
    });
  }

  return messages;
}

function selectRecentHistory(transcripts: TranscriptSegment[], maxCharacters: number): TranscriptSegment[] {
  const selected: TranscriptSegment[] = [];
  let characterCount = 0;

  for (const segment of [...transcripts].reverse()) {
    const content = segment.content.trim();
    if (!content) {
      continue;
    }

    const nextCount = characterCount + content.length;
    if (selected.length > 0 && nextCount > maxCharacters) {
      break;
    }

    selected.push(segment);
    characterCount = nextCount;
  }

  return selected.reverse();
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
