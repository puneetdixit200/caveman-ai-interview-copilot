import { describe, expect, it } from "vitest";
import {
  buildPluginCatalog,
  createEmptyPluginCatalog,
  parsePluginCatalog,
  serializePluginCatalog
} from "./pluginLoader";
import type { PluginSettings } from "../types/settings";

const settings: PluginSettings = {
  enabled: true,
  directory: "C:\\caveman-plugins",
  allowPromptTemplates: true,
  allowExportFormats: true,
  allowPracticePacks: true
};

describe("pluginLoader", () => {
  it("loads safe plugin manifests and collects enabled contributions", () => {
    const catalog = buildPluginCatalog(
      [
        {
          path: "C:\\caveman-plugins\\backend\\plugin.json",
          manifestJson: JSON.stringify({
            id: "backend-pack",
            name: "Backend Pack",
            version: "1.0.0",
            contributes: {
              promptTemplates: [
                {
                  id: "backend-senior",
                  name: "Senior Backend",
                  category: "system_design",
                  systemPrompt: "Answer as a senior backend engineer with concrete tradeoffs."
                }
              ],
              exportFormats: ["json"],
              exportTemplates: [
                {
                  id: "interview-brief",
                  name: "Interview Brief",
                  fileExtension: "md",
                  contentTemplate: "# {{session.title}}\n{{transcript.markdown}}"
                }
              ],
              practicePacks: [
                {
                  id: "queues",
                  name: "Queue Practice",
                  interviewType: "system_design",
                  questions: [
                    {
                      id: "retries",
                      prompt: "How do you retry jobs safely?",
                      expectedSignals: ["idempotency", "backoff"]
                    }
                  ]
                }
              ]
            }
          })
        }
      ],
      settings
    );

    expect(catalog.loaded).toHaveLength(1);
    expect(catalog.promptTemplates[0]).toMatchObject({ id: "backend-senior" });
    expect(catalog.exportFormats).toEqual(["json"]);
    expect(catalog.exportTemplates[0]).toMatchObject({ id: "interview-brief", fileExtension: "md" });
    expect(catalog.practicePacks[0]).toMatchObject({ id: "queues" });
  });

  it("persists and parses a loaded catalog", () => {
    const parsed = parsePluginCatalog(serializePluginCatalog(createEmptyPluginCatalog()));

    expect(parsed).toEqual(createEmptyPluginCatalog());
  });

  it("reports invalid plugin manifests without loading them", () => {
    const catalog = buildPluginCatalog(
      [
        {
          path: "C:\\caveman-plugins\\unsafe\\plugin.json",
          manifestJson: JSON.stringify({
            id: "unsafe",
            name: "Unsafe",
            version: "1.0.0",
            permissions: ["filesystem"],
            contributes: {}
          })
        }
      ],
      settings
    );

    expect(catalog.loaded).toHaveLength(0);
    expect(catalog.errors[0]).toContain("cannot request filesystem");
  });
});
