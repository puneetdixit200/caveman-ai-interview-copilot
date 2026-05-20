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

export function buildSessionPdfLines({ session, transcripts, responses }: ExportSessionInput): string[] {
  return [
    session.title,
    "",
    "Metadata",
    `Company: ${session.company || "Unspecified"}`,
    `Role: ${session.role || "Unspecified"}`,
    `Interview type: ${session.interviewType}`,
    `Tags: ${session.tags.length > 0 ? session.tags.join(", ") : "none"}`,
    `Duration: ${Math.round(session.durationSeconds / 60)} min`,
    `Tokens: ${session.totalTokens}`,
    "",
    "Transcript",
    ...(transcripts.length > 0
      ? transcripts.map(
          (segment) =>
            `[${formatTimestampMs(segment.timestampMs)}] ${segment.speaker.toUpperCase()}: ${segment.content}`
        )
      : ["No transcript captured."]),
    "",
    "AI Responses",
    ...(responses.length > 0
      ? responses.flatMap((response) => [
          `${formatProviderName(response.provider)} / ${response.model}`,
          response.latencyMs ? `Latency: ${response.latencyMs}ms` : "Latency: not recorded",
          response.response,
          ""
        ])
      : ["No AI responses captured."])
  ];
}

export function sessionExportFilename(session: Pick<SessionRecord, "title" | "id">, extension: string): string {
  const base =
    session.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || session.id;

  return `${base}.${extension.replace(/^\./, "")}`;
}

export async function downloadSessionPdf(input: ExportSessionInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 44;
  const marginY = 48;
  const lineHeight = 16;
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
  let cursorY = marginY;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  for (const line of buildSessionPdfLines(input)) {
    const wrapped = doc.splitTextToSize(line, maxWidth) as string[];
    for (const wrappedLine of wrapped.length > 0 ? wrapped : [""]) {
      if (cursorY > pageHeight - marginY) {
        doc.addPage();
        cursorY = marginY;
      }

      doc.text(wrappedLine, marginX, cursorY);
      cursorY += lineHeight;
    }
  }

  doc.save(sessionExportFilename(input.session, "pdf"));
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
