import { cleanup, render, screen } from "@testing-library/react";
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
    cleanup();
  });

  it("shows extracted code suggestions with copy controls", () => {
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
    expect(screen.getByText("const answer = 42;")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Code" })).toBeInTheDocument();
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
