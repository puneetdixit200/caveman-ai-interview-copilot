import { afterEach, describe, expect, it } from "vitest";
import {
  deleteProviderApiKey,
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
