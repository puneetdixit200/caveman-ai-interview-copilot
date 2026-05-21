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

export interface KnowledgeDocumentRecord {
  id: string;
  title: string;
  sourceType: string;
  characterCount: number;
  createdAtMs: number;
}

export interface KnowledgeBase {
  documents: KnowledgeDocumentRecord[];
  chunks: KnowledgeChunk[];
}

export const KNOWLEDGE_BASE_SETTING_KEY = "knowledge.base";

export function createKnowledgeBase(): KnowledgeBase {
  return {
    documents: [],
    chunks: []
  };
}

export function upsertKnowledgeDocument(base: KnowledgeBase, input: KnowledgeDocumentInput): KnowledgeBase {
  const createdAtMs = input.createdAtMs ?? Date.now();
  const documentInput = { ...input, createdAtMs };
  const chunks = chunkKnowledgeDocument(documentInput);
  const document: KnowledgeDocumentRecord = {
    id: input.id,
    title: input.title,
    sourceType: input.sourceType,
    characterCount: input.text.length,
    createdAtMs
  };

  return {
    documents: [...base.documents.filter((item) => item.id !== input.id), document],
    chunks: [...base.chunks.filter((chunk) => chunk.documentId !== input.id), ...chunks]
  };
}

export function removeKnowledgeDocument(base: KnowledgeBase, documentId: string): KnowledgeBase {
  return {
    documents: base.documents.filter((item) => item.id !== documentId),
    chunks: base.chunks.filter((chunk) => chunk.documentId !== documentId)
  };
}

export function clearKnowledgeBase(): KnowledgeBase {
  return createKnowledgeBase();
}

export function searchKnowledgeBase(base: KnowledgeBase, query: string, limit = 5): KnowledgeChunk[] {
  return rankKnowledgeChunks(query, base.chunks, limit);
}

export function serializeKnowledgeBase(base: KnowledgeBase): string {
  return JSON.stringify(base, null, 2);
}

export function parseKnowledgeBase(raw: string | null | undefined): KnowledgeBase {
  if (!raw?.trim()) {
    return createKnowledgeBase();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<KnowledgeBase>;
    return {
      documents: Array.isArray(parsed.documents)
        ? parsed.documents.filter(isKnowledgeDocumentRecord)
        : [],
      chunks: Array.isArray(parsed.chunks) ? parsed.chunks.filter(isKnowledgeChunk) : []
    };
  } catch {
    return createKnowledgeBase();
  }
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
    .map((chunk) => {
      const overlap = overlapScore(queryTerms, tokenize(chunk.text));
      return {
        chunk,
        overlap,
        score: overlap + (chunk.createdAtMs ?? 0) / 1_000_000_000
      };
    })
    .filter((entry) => entry.overlap > 0)
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

function isKnowledgeDocumentRecord(value: unknown): value is KnowledgeDocumentRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as KnowledgeDocumentRecord).id === "string" &&
    typeof (value as KnowledgeDocumentRecord).title === "string" &&
    typeof (value as KnowledgeDocumentRecord).sourceType === "string" &&
    typeof (value as KnowledgeDocumentRecord).characterCount === "number" &&
    typeof (value as KnowledgeDocumentRecord).createdAtMs === "number"
  );
}

function isKnowledgeChunk(value: unknown): value is KnowledgeChunk {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as KnowledgeChunk).id === "string" &&
    typeof (value as KnowledgeChunk).documentId === "string" &&
    typeof (value as KnowledgeChunk).sourceLabel === "string" &&
    typeof (value as KnowledgeChunk).text === "string"
  );
}
