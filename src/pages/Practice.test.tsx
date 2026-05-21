import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_CONFIG_SETTING_KEY, DEFAULT_APP_CONFIG, serializeAppConfig } from "../lib/appConfig";
import { PLUGIN_CATALOG_SETTING_KEY } from "../lib/pluginLoader";
import { Practice } from "./Practice";

const providerMocks = vi.hoisted(() => ({
  createConfiguredProvider: vi.fn()
}));

vi.mock("../lib/tauri", () => ({
  getSetting: vi.fn(async (key: string) =>
    key === PLUGIN_CATALOG_SETTING_KEY
      ? JSON.stringify({
          loaded: [],
          errors: [],
          promptTemplates: [],
          exportFormats: [],
          practicePacks: [
            {
              id: "queues-pack",
              name: "Queue Interviews",
              interviewType: "system_design",
              questions: [
                {
                  id: "dead-letter",
                  prompt: "Design dead-letter queue handling.",
                  expectedSignals: ["retry", "backoff", "alert"]
                }
              ]
            }
          ]
        })
      : key === APP_CONFIG_SETTING_KEY
        ? serializeAppConfig(DEFAULT_APP_CONFIG)
      : undefined
  ),
  getProviderApiKey: vi.fn(async () => undefined)
}));

vi.mock("../lib/providerClients", () => ({
  createConfiguredProvider: providerMocks.createConfiguredProvider
}));

describe("Practice", () => {
  afterEach(() => {
    providerMocks.createConfiguredProvider.mockReset();
    cleanup();
  });

  it("loads plugin practice packs into interviewer mode", async () => {
    render(<Practice />);

    expect(await screen.findByRole("combobox", { name: "Practice pack" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Queue Interviews" })).toBeInTheDocument();
  });

  it("generates an AI interviewer follow-up from the configured provider", async () => {
    providerMocks.createConfiguredProvider.mockReturnValue({
      id: "ollama",
      label: "Ollama",
      kind: "local",
      healthCheck: vi.fn(async () => ({ ok: true, latencyMs: 1 })),
      chatStream: async function* () {
        yield "What storage tradeoff ";
        yield "would you make next?";
      }
    });
    const user = userEvent.setup();

    render(<Practice />);

    await user.type(await screen.findByRole("textbox", { name: "Your answer" }), "I would use queues and retries.");
    await user.click(screen.getByRole("button", { name: "Score Answer" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Follow-Up" }));

    expect(await screen.findByText("What storage tradeoff would you make next?")).toBeInTheDocument();
    expect(providerMocks.createConfiguredProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ollama" })
    );
  });
});
