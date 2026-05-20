import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLUGIN_CATALOG_SETTING_KEY } from "../lib/pluginLoader";
import { Practice } from "./Practice";

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
      : undefined
  )
}));

describe("Practice", () => {
  afterEach(() => {
    cleanup();
  });

  it("loads plugin practice packs into interviewer mode", async () => {
    render(<Practice />);

    expect(await screen.findByRole("combobox", { name: "Practice pack" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Queue Interviews" })).toBeInTheDocument();
  });
});
