import type { InterviewType, PromptTemplate } from "../types/session";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  contributes: {
    promptTemplates?: PromptTemplate[];
    exportFormats?: string[];
    practicePacks?: PluginPracticePack[];
  };
}

export interface PluginPracticeQuestion {
  id: string;
  prompt: string;
  expectedSignals: string[];
}

export interface PluginPracticePack {
  id: string;
  name: string;
  interviewType: InterviewType;
  questions: PluginPracticeQuestion[];
}

export interface PluginValidationResult {
  ok: boolean;
  errors: string[];
  manifest?: PluginManifest;
}

const UNSAFE_PERMISSIONS = new Set(["filesystem", "secrets", "shell", "nativeCommands"]);

export function validatePluginManifest(raw: unknown): PluginValidationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: ["Plugin manifest must be an object."] };
  }

  const permissions = Array.isArray(raw.permissions) ? raw.permissions : [];
  const contributes = isRecord(raw.contributes) ? raw.contributes : {};
  const requestedNativeCommands = Array.isArray(contributes.nativeCommands);
  if (permissions.some((permission) => UNSAFE_PERMISSIONS.has(String(permission))) || requestedNativeCommands) {
    errors.push("Plugins cannot request filesystem, secret, shell, or native command access.");
  }

  if (!isSafeId(raw.id)) {
    errors.push("Plugin id must use lowercase letters, numbers, and hyphens.");
  }

  if (typeof raw.name !== "string" || !raw.name.trim()) {
    errors.push("Plugin name is required.");
  }

  if (typeof raw.version !== "string" || !/^\d+\.\d+\.\d+$/.test(raw.version)) {
    errors.push("Plugin version must be semver, for example 1.0.0.");
  }

  const manifest: PluginManifest | undefined =
    errors.length === 0 && isSafeId(raw.id) && typeof raw.name === "string" && typeof raw.version === "string"
      ? {
          id: raw.id,
          name: raw.name,
          version: raw.version,
          contributes: {
            promptTemplates: readPromptTemplates(contributes.promptTemplates),
            exportFormats: readStringArray(contributes.exportFormats),
            practicePacks: readPracticePacks(contributes.practicePacks)
          }
        }
      : undefined;

  return { ok: errors.length === 0, errors, manifest };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+$/.test(value);
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readPromptTemplates(value: unknown): PromptTemplate[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const templates = value.filter(isPromptTemplate);
  return templates.length > 0 ? templates : undefined;
}

function isPromptTemplate(value: unknown): value is PromptTemplate {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isSafeId(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isInterviewType(value.category) &&
    typeof value.systemPrompt === "string" &&
    value.systemPrompt.trim().length > 0
  );
}

function readPracticePacks(value: unknown): PluginPracticePack[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const packs = value.filter(isPracticePack);
  return packs.length > 0 ? packs : undefined;
}

function isPracticePack(value: unknown): value is PluginPracticePack {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isSafeId(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isInterviewType(value.interviewType) &&
    Array.isArray(value.questions) &&
    value.questions.every(isPracticeQuestion)
  );
}

function isPracticeQuestion(value: unknown): value is PluginPracticeQuestion {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isSafeId(value.id) &&
    typeof value.prompt === "string" &&
    value.prompt.trim().length > 0 &&
    Array.isArray(value.expectedSignals) &&
    value.expectedSignals.every((signal) => typeof signal === "string" && signal.trim().length > 0)
  );
}

function isInterviewType(value: unknown): value is InterviewType {
  return value === "dsa" || value === "system_design" || value === "behavioral" || value === "hr" || value === "mixed";
}
