import { describe, expect, it } from "vitest";
import {
  createKnowledgeBase,
  clearKnowledgeBase,
  parseKnowledgeBase,
  removeKnowledgeDocument,
  searchKnowledgeBase,
  serializeKnowledgeBase,
  upsertKnowledgeDocument,
  chunkKnowledgeDocument,
  rankKnowledgeChunks
} from "./knowledge";

describe("knowledge", () => {
  it("chunks local knowledge documents with source labels", () => {
    expect(
      chunkKnowledgeDocument({
        id: "doc-1",
        title: "Payments Project",
        sourceType: "project",
        text: "Built Stripe webhooks and reconciliation. Added queue retries for failed invoices.",
        maxChunkCharacters: 42
      })
    ).toEqual([
      expect.objectContaining({ documentId: "doc-1", sourceLabel: "project: Payments Project" }),
      expect.objectContaining({ text: "Added queue retries for failed invoices." })
    ]);
  });

  it("ranks chunks by query overlap and recency", () => {
    const chunks = [
      { id: "old", documentId: "d1", sourceLabel: "note: Old", text: "React dashboard charts", createdAtMs: 100 },
      { id: "new", documentId: "d2", sourceLabel: "project: Billing", text: "Stripe webhook retry queue", createdAtMs: 300 }
    ];

    expect(rankKnowledgeChunks("How did you design webhook retries?", chunks, 1)[0].id).toBe("new");
  });

  it("persists imported knowledge documents and searches ranked chunks", () => {
    const base = upsertKnowledgeDocument(createKnowledgeBase(), {
      id: "payments",
      title: "Payments Project",
      sourceType: "project",
      text: "Built Stripe webhook retries with queue backoff. Added reconciliation dashboards.",
      createdAtMs: 500
    });

    const parsed = parseKnowledgeBase(serializeKnowledgeBase(base));
    const results = searchKnowledgeBase(parsed, "How did webhook retries work?", 1);

    expect(parsed.documents).toEqual([
      expect.objectContaining({
        id: "payments",
        title: "Payments Project",
        sourceType: "project"
      })
    ]);
    expect(results[0]).toMatchObject({
      documentId: "payments",
      sourceLabel: "project: Payments Project"
    });
  });

  it("removes stale documents and their chunks from persisted context", () => {
    const base = upsertKnowledgeDocument(
      upsertKnowledgeDocument(createKnowledgeBase(), {
        id: "payments",
        title: "Payments Project",
        sourceType: "project",
        text: "Built Stripe webhook retries with queue backoff.",
        createdAtMs: 500
      }),
      {
        id: "legacy",
        title: "Legacy AngularJS Migration",
        sourceType: "project",
        text: "Migrated AngularJS templates into React routes.",
        createdAtMs: 700
      }
    );

    const withoutLegacy = removeKnowledgeDocument(base, "legacy");

    expect(withoutLegacy.documents.map((document) => document.id)).toEqual(["payments"]);
    expect(withoutLegacy.chunks.every((chunk) => chunk.documentId !== "legacy")).toBe(true);
    expect(searchKnowledgeBase(withoutLegacy, "AngularJS migration", 1)).toHaveLength(0);
    expect(clearKnowledgeBase()).toEqual(createKnowledgeBase());
  });
});
