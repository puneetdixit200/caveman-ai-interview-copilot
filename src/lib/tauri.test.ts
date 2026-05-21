import { afterEach, describe, expect, it } from "vitest";
import {
  clearKnowledgeBaseNative,
  deleteProviderApiKey,
  deleteKnowledgeDocumentNative,
  listKnowledgeBase,
  saveKnowledgeDocumentNative,
  listSecurityEvents,
  saveProviderApiKey,
  typeTextIntoActiveWindow
} from "./tauri";

describe("tauri fallback security events", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("records sensitive fallback actions without storing secret values", async () => {
    await saveProviderApiKey("openai", "sk-live-secret");
    await typeTextIntoActiveWindow("Use idempotency keys.");
    await deleteProviderApiKey("openai");

    const events = await listSecurityEvents(10);
    const serialized = JSON.stringify(events);

    expect(events.map((event) => event.action)).toEqual([
      "provider_key_deleted",
      "active_window_typing",
      "provider_key_saved"
    ]);
    expect(events[2]).toMatchObject({
      category: "secret",
      target: "openai"
    });
    expect(serialized).not.toContain("sk-live-secret");
  });
});

describe("tauri fallback knowledge persistence", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("persists, deletes, and clears knowledge documents through native-compatible wrappers", async () => {
    await saveKnowledgeDocumentNative({
      id: "payments",
      title: "Payments Project",
      sourceType: "project",
      text: "Built Stripe webhook retries with queue backoff.",
      createdAtMs: 500
    });

    expect(await listKnowledgeBase()).toMatchObject({
      documents: [expect.objectContaining({ id: "payments", title: "Payments Project" })],
      chunks: [expect.objectContaining({ documentId: "payments" })]
    });

    await deleteKnowledgeDocumentNative("payments");
    expect((await listKnowledgeBase()).documents).toHaveLength(0);

    await saveKnowledgeDocumentNative({
      id: "resume",
      title: "Resume",
      sourceType: "resume",
      text: "Led platform migrations.",
      createdAtMs: 700
    });
    await clearKnowledgeBaseNative();

    expect(await listKnowledgeBase()).toEqual({ documents: [], chunks: [] });
  });
});
