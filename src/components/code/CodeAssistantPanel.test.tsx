import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CodeAssistantPanel } from "./CodeAssistantPanel";

describe("CodeAssistantPanel", () => {
  afterEach(() => {
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
});
