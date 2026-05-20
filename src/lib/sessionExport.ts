import type { AIResponseRecord, SessionRecord, TranscriptSegment } from "../types/session";
import { formatTimestampMs } from "./formatters";

interface ExportSessionInput {
  session: SessionRecord;
  transcripts: TranscriptSegment[];
  responses: AIResponseRecord[];
}

export function exportSessionMarkdown({ session, transcripts, responses }: ExportSessionInput): string {
  const metadata = [
    `Company: ${session.company ?? "Unspecified"}`,
    `Role: ${session.role ?? "Unspecified"}`,
    `Interview type: ${session.interviewType}`,
    `Tags: ${session.tags.length > 0 ? session.tags.join(", ") : "none"}`,
    `Duration: ${Math.round(session.durationSeconds / 60)} min`,
    `Tokens: ${session.totalTokens}`
  ];

  const transcriptLines = transcripts.map((segment) => {
    return `- [${formatTimestampMs(segment.timestampMs)}] ${segment.speaker.toUpperCase()}: ${segment.content}`;
  });

  const responseLines = responses.map((response) => {
    return [
      `### ${formatProviderName(response.provider)} / ${response.model}`,
      response.latencyMs ? `Latency: ${response.latencyMs}ms` : undefined,
      "",
      response.response
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n");
  });

  return [
    `# ${session.title}`,
    "",
    "## Metadata",
    ...metadata.map((line) => `- ${line}`),
    "",
    "## Transcript",
    transcriptLines.length > 0 ? transcriptLines.join("\n") : "_No transcript captured._",
    "",
    "## AI Responses",
    responseLines.length > 0 ? responseLines.join("\n\n") : "_No AI responses captured._",
    ""
  ].join("\n");
}

export function exportSessionJson({ session, transcripts, responses }: ExportSessionInput): string {
  return JSON.stringify(
    {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      session,
      transcripts,
      responses
    },
    null,
    2
  );
}

function formatProviderName(provider: string): string {
  const knownProviders: Record<string, string> = {
    lmstudio: "LM Studio",
    openai: "OpenAI",
    openrouter: "OpenRouter"
  };
  const normalized = provider.toLowerCase().replace(/[-_\s]+/g, "");

  if (knownProviders[normalized]) {
    return knownProviders[normalized];
  }

  return provider
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}
