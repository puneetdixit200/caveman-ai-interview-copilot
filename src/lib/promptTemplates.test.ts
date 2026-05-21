import { describe, expect, it } from "vitest";
import { getPromptTemplate, promptTemplates } from "./promptTemplates";

describe("promptTemplates", () => {
  it("ships the full interview template set from the product docs", () => {
    expect(promptTemplates.map((template) => template.id)).toEqual([
      "dsa",
      "system-design",
      "frontend",
      "backend",
      "devops-cloud",
      "behavioral",
      "hr-culture"
    ]);
    expect(promptTemplates.map((template) => template.category)).toEqual([
      "dsa",
      "system_design",
      "frontend",
      "backend",
      "devops_cloud",
      "behavioral",
      "hr"
    ]);
  });

  it("uses role-specific coaching language for frontend, backend, and DevOps rounds", () => {
    expect(getPromptTemplate("frontend").systemPrompt).toContain("accessibility");
    expect(getPromptTemplate("backend").systemPrompt).toContain("reliability");
    expect(getPromptTemplate("devops-cloud").systemPrompt).toContain("cloud");
  });
});
