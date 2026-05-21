import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeAssistantPanel } from "./CodeAssistantPanel";

const tauriMocks = vi.hoisted(() => ({
  getActiveWindowInfo: vi.fn(),
  typeTextIntoActiveWindow: vi.fn()
}));

vi.mock("../../lib/tauri", () => ({
  getActiveWindowInfo: tauriMocks.getActiveWindowInfo,
  typeTextIntoActiveWindow: tauriMocks.typeTextIntoActiveWindow
}));

describe("CodeAssistantPanel", () => {
  beforeEach(() => {
    tauriMocks.getActiveWindowInfo.mockResolvedValue({
      title: "main.ts - Visual Studio Code",
      processName: "Code.exe",
      executablePath: "C:\\Users\\mrpun\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
      editorKind: "VS Code",
      isCodeEditor: true
    });
  });

  afterEach(() => {
    tauriMocks.getActiveWindowInfo.mockReset();
    tauriMocks.typeTextIntoActiveWindow.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("shows extracted code suggestions with readable language labels and syntax tokens", () => {
    render(
      <CodeAssistantPanel
        responses={[
          {
            id: 1,
            sessionId: "s1",
            provider: "ollama",
            model: "llama3.1:8b",
            response: "Use this:\n```ts\nconst answer = 42;\n```",
            createdAt: "2026-05-20T00:00:00.000Z"
          }
        ]}
      />
    );

    expect(screen.getByText("Code Assistant")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("const")).toHaveClass("syntax-keyword");
    expect(screen.getByText("42")).toHaveClass("syntax-number");
    expect(screen.getByRole("button", { name: "Copy Code" })).toBeInTheDocument();
  });

  it("copies an extracted code suggestion to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(
      <CodeAssistantPanel
        responses={[
          {
            id: 1,
            sessionId: "s1",
            provider: "ollama",
            model: "llama3.1:8b",
            response: "```ts\nconst answer = 42;\n```",
            createdAt: "2026-05-20T00:00:00.000Z"
          }
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Copy Code" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("const answer = 42;"));
    expect(await screen.findByText("Code copied")).toBeInTheDocument();
  });

  it("types an extracted code suggestion into the active editor", async () => {
    tauriMocks.typeTextIntoActiveWindow.mockResolvedValue({ characterCount: 18, inputEventCount: 36 });
    const user = userEvent.setup();

    render(
      <CodeAssistantPanel
        responses={[
          {
            id: 1,
            sessionId: "s1",
            provider: "ollama",
            model: "llama3.1:8b",
            response: "```ts\nconst answer = 42;\n```",
            createdAt: "2026-05-20T00:00:00.000Z"
          }
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Type Code" }));

    expect(tauriMocks.getActiveWindowInfo).toHaveBeenCalled();
    expect(tauriMocks.typeTextIntoActiveWindow).toHaveBeenCalledWith("const answer = 42;");
    expect(await screen.findByText("Typed 18 code characters into VS Code")).toBeInTheDocument();
  });

  it("does not type code when the active window is not a recognized editor", async () => {
    tauriMocks.getActiveWindowInfo.mockResolvedValue({
      title: "Interview - Google Meet",
      processName: "chrome.exe",
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      editorKind: null,
      isCodeEditor: false
    });
    const user = userEvent.setup();

    render(
      <CodeAssistantPanel
        responses={[
          {
            id: 1,
            sessionId: "s1",
            provider: "ollama",
            model: "llama3.1:8b",
            response: "```ts\nconst answer = 42;\n```",
            createdAt: "2026-05-20T00:00:00.000Z"
          }
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Type Code" }));

    expect(tauriMocks.typeTextIntoActiveWindow).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Focus a code editor before typing code. Active window: Interview - Google Meet (chrome.exe)")
    ).toBeInTheDocument();
  });
});
