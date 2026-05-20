export interface KnowledgeDocumentInput {
  id: string;
  title: string;
  sourceType: string;
  text: string;
  maxChunkCharacters?: number;
  createdAtMs?: number;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  sourceLabel: string;
  text: string;
  createdAtMs?: number;
}

export function chunkKnowledgeDocument(input: KnowledgeDocumentInput): KnowledgeChunk[] {
  const maxCharacters = input.maxChunkCharacters ?? 800;
  const sourceLabel = `${input.sourceType}: ${input.title}`;
  const sentences = input.text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: KnowledgeChunk[] = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (current && next.length > maxCharacters) {
      chunks.push(createChunk(input, sourceLabel, current, chunks.length));
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(createChunk(input, sourceLabel, current, chunks.length));
  }

  return chunks;
}

export function rankKnowledgeChunks(query: string, chunks: KnowledgeChunk[], limit = 5): KnowledgeChunk[] {
  const queryTerms = tokenize(query);
  return [...chunks]
    .map((chunk) => ({
      chunk,
      score: overlapScore(queryTerms, tokenize(chunk.text)) + (chunk.createdAtMs ?? 0) / 1_000_000_000
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.chunk);
}

function createChunk(
  input: KnowledgeDocumentInput,
  sourceLabel: string,
  text: string,
  index: number
): KnowledgeChunk {
  return {
    id: `${input.id}-${index + 1}`,
    documentId: input.id,
    sourceLabel,
    text,
    createdAtMs: input.createdAtMs
  };
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function overlapScore(queryTerms: Set<string>, chunkTerms: Set<string>): number {
  let score = 0;
  for (const term of queryTerms) {
    if (chunkTerms.has(term)) {
      score += 1;
    }
  }
  return score;
}
