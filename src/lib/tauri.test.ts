import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addTranscript,
  addPracticeScore,
  clearKnowledgeBaseNative,
  deleteProviderApiKey,
  deleteKnowledgeDocumentNative,
  detectScreenShareStatus,
  getActiveWindowInfo,
  getRuntimeBudgetStatus,
  listPracticeScores,
  listKnowledgeBase,
  protectOverlayWindow,
  saveKnowledgeDocumentNative,
  listSecurityEvents,
  saveProviderApiKey,
  setCompanionWindowsVisible,
  setOverlayWindowBounds,
  setOverlayWindowVisible,
  typeTextIntoActiveWindow
} from "./tauri";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

afterEach(() => {
  invokeMock.mockReset();
  delete window.__TAURI_INTERNALS__;
});

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

describe("tauri fallback active window detection", () => {
  it("returns an editor-compatible browser fallback outside the desktop app", async () => {
    await expect(getActiveWindowInfo()).resolves.toMatchObject({
      processName: "browser",
      editorKind: "Browser fallback",
      isCodeEditor: true
    });
  });
});

describe("tauri fallback runtime budget", () => {
  it("reports startup, memory, and CPU budget targets for readiness checks", async () => {
    const status = await getRuntimeBudgetStatus();

    expect(status.startupTargetMs).toBe(3000);
    expect(status.memoryTargetMb).toBe(500);
    expect(status.idleCpuTargetPercent).toBe(15);
    expect(status.activeCpuTargetPercent).toBe(40);
    expect(status.startupMs).toBeGreaterThanOrEqual(0);
  });
});

describe("tauri desktop screen-share detection", () => {
  it("propagates native detector failures so the dashboard can fail closed", async () => {
    window.__TAURI_INTERNALS__ = {};
    invokeMock.mockRejectedValueOnce(new Error("ps failed"));

    await expect(detectScreenShareStatus()).rejects.toThrow("ps failed");
    expect(invokeMock).toHaveBeenCalledWith("detect_screen_share_status", {});
  });
});

describe("tauri desktop capture exclusion enforcement", () => {
  it("never forwards a disabled capture-exclusion request to native privacy commands", async () => {
    window.__TAURI_INTERNALS__ = {};
    invokeMock
      .mockResolvedValueOnce({
        alwaysOnTop: true,
        skipTaskbar: true,
        captureExclusion: "enabled",
        clickThrough: true,
        visible: false
      })
      .mockResolvedValueOnce({
        alwaysOnTop: true,
        skipTaskbar: true,
        captureExclusion: "enabled",
        clickThrough: true,
        visible: false
      })
      .mockResolvedValueOnce({
        alwaysOnTop: false,
        skipTaskbar: false,
        captureExclusion: "enabled",
        clickThrough: false,
        visible: false
      })
      .mockResolvedValueOnce({
        x: 80,
        y: 80,
        width: 680,
        height: 420
      });

    await protectOverlayWindow(false);
    await setOverlayWindowVisible(false, false);
    await setCompanionWindowsVisible(false, false);
    await setOverlayWindowBounds({ x: 80, y: 80, width: 680, height: 420 }, false);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "protect_overlay_window", { captureExclusionEnabled: true });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "set_overlay_window_visible", {
      visible: false,
      captureExclusionEnabled: true
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "set_companion_windows_visible", {
      visible: false,
      captureExclusionEnabled: true
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "set_overlay_window_bounds", {
      bounds: { x: 80, y: 80, width: 680, height: 420 },
      captureExclusionEnabled: true
    });
  });
});

describe("tauri fallback practice scores", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("persists practice scores through native-compatible wrappers", async () => {
    const saved = await addPracticeScore({
      sessionId: "practice-session-1",
      questionId: "system-design-url-shortener",
      question: "Design a URL shortener.",
      answer: "Use requirements, cache, queue, and storage tradeoffs.",
      score: 4,
      feedback: "Covered requirements, cache, queue.",
      nextAction: "Add storage tradeoffs.",
      matchedSignals: ["requirements", "cache", "queue"]
    });

    expect(saved.id).toBeGreaterThan(0);
    expect(await listPracticeScores("practice-session-1")).toEqual([
      expect.objectContaining({
        sessionId: "practice-session-1",
        questionId: "system-design-url-shortener",
        score: 4
      })
    ]);
  });
});

describe("tauri fallback transcripts", () => {
  it("keeps live STT source and language metadata on saved transcript fallbacks", async () => {
    await expect(
      addTranscript({
        sessionId: "s1",
        speaker: "interviewer",
        content: "Explain quorum writes.",
        timestampMs: 1200,
        confidence: 0.92,
        source: "system",
        language: "en-US"
      })
    ).resolves.toMatchObject({
      source: "system",
      language: "en-US"
    });
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
