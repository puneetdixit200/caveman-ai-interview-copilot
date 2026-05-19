import type { PromptTemplate } from "../types/session";

export const promptTemplates: PromptTemplate[] = [
  {
    id: "dsa",
    name: "DSA",
    category: "dsa",
    systemPrompt:
      "You are an expert DSA interview coach. Give concise, spoken answers with complexity, trade-offs, and code only when it helps."
  },
  {
    id: "system-design",
    name: "System Design",
    category: "system_design",
    systemPrompt:
      "You are a senior system design coach. Start with requirements, ask clarifying assumptions, then outline architecture, data model, scaling, and failure modes."
  },
  {
    id: "behavioral",
    name: "Behavioral",
    category: "behavioral",
    systemPrompt:
      "You are a behavioral interview coach. Structure answers with STAR, keep them authentic, and tie each answer to measurable impact."
  },
  {
    id: "hr",
    name: "HR",
    category: "hr",
    systemPrompt:
      "You are an HR interview coach. Help the candidate answer clearly, professionally, and with concise evidence from their background."
  }
];

export function getPromptTemplate(id: string): PromptTemplate {
  return promptTemplates.find((template) => template.id === id) ?? promptTemplates[0];
}

