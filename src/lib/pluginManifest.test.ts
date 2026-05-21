import { describe, expect, it } from "vitest";
import { validatePluginManifest } from "./pluginManifest";

describe("pluginManifest", () => {
  it("accepts constrained prompt/export/practice plugin contributions", () => {
    expect(
      validatePluginManifest({
        id: "local-practice-pack",
        name: "Local Practice Pack",
        version: "1.0.0",
        contributes: {
          promptTemplates: [
            {
              id: "behavioral-star-plugin",
              name: "Behavioral STAR Plugin",
              category: "behavioral",
              systemPrompt: "Coach a concise STAR response grounded in the candidate context."
            },
            {
              id: "frontend-accessibility-plugin",
              name: "Frontend Accessibility Plugin",
              category: "frontend",
              systemPrompt: "Coach frontend answers with accessibility, state, and rendering tradeoffs."
            }
          ],
          exportFormats: ["markdown"],
          exportTemplates: [
            {
              id: "ats-summary",
              name: "ATS Summary",
              fileExtension: "txt",
              contentTemplate: "Session: {{session.title}}\n{{transcript.plain}}\n{{responses.plain}}"
            }
          ],
          practicePacks: [
            {
              id: "backend-senior",
              name: "Senior Backend Pack",
              interviewType: "system_design",
              questions: [
                {
                  id: "queues",
                  prompt: "Design a durable queue.",
                  expectedSignals: ["partitioning", "retry", "dead letter"]
                }
              ]
            },
            {
              id: "devops-cloud",
              name: "DevOps Cloud Pack",
              interviewType: "devops_cloud",
              questions: [
                {
                  id: "incident-rollout",
                  prompt: "Plan a safe production rollout.",
                  expectedSignals: ["observability", "rollback", "blast radius"]
                }
              ]
            }
          ]
        }
      })
    ).toEqual({
      ok: true,
      errors: [],
      manifest: expect.objectContaining({
        id: "local-practice-pack",
        contributes: expect.objectContaining({
          exportTemplates: [expect.objectContaining({ id: "ats-summary", fileExtension: "txt" })]
        })
      })
    });
  });

  it("rejects filesystem, secret, or command access requests", () => {
    const result = validatePluginManifest({
      id: "unsafe",
      name: "Unsafe",
      version: "1.0",
      permissions: ["filesystem", "secrets", "shell"],
      contributes: { nativeCommands: ["run"] }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Plugins cannot request filesystem, secret, shell, or native command access.");
  });
});
