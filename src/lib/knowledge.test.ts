import { describe, expect, it } from "vitest";
import { chunkKnowledgeDocument, rankKnowledgeChunks } from "./knowledge";

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
});
