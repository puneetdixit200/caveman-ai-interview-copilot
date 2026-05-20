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
          promptTemplates: ["behavioral-star"],
          exportFormats: ["markdown"],
          practicePacks: ["backend-senior"]
        }
      })
    ).toEqual({
      ok: true,
      errors: [],
      manifest: expect.objectContaining({ id: "local-practice-pack" })
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
