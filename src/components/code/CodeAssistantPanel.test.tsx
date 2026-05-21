import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeAssistantPanel } from "./CodeAssistantPanel";

const tauriMocks = vi.hoisted(() => ({
  typeTextIntoActiveWindow: vi.fn()
}));

vi.mock("../../lib/tauri", () => ({
  typeTextIntoActiveWindow: tauriMocks.typeTextIntoActiveWindow
}));

describe("CodeAssistantPanel", () => {
  afterEach(() => {
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

    expect(tauriMocks.typeTextIntoActiveWindow).toHaveBeenCalledWith("const answer = 42;");
    expect(await screen.findByText("Typed 18 code characters into the active editor")).toBeInTheDocument();
  });
});
