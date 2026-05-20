import { validatePluginManifest, type PluginManifest, type PluginPracticePack } from "./pluginManifest";
import type { PromptTemplate } from "../types/session";
import type { PluginSettings } from "../types/settings";

export interface PluginManifestFile {
  path: string;
  manifestJson?: string | null;
  error?: string | null;
}

export interface LoadedPlugin {
  path: string;
  manifest: PluginManifest;
}

export interface PluginCatalog {
  loaded: LoadedPlugin[];
  errors: string[];
  promptTemplates: PromptTemplate[];
  exportFormats: string[];
  practicePacks: PluginPracticePack[];
}

export const PLUGIN_CATALOG_SETTING_KEY = "plugins.catalog";

export function createEmptyPluginCatalog(): PluginCatalog {
  return {
    loaded: [],
    errors: [],
    promptTemplates: [],
    exportFormats: [],
    practicePacks: []
  };
}

export function buildPluginCatalog(files: PluginManifestFile[], settings: PluginSettings): PluginCatalog {
  const loaded: LoadedPlugin[] = [];
  const errors: string[] = [];

  if (!settings.enabled) {
    return {
      ...createEmptyPluginCatalog(),
      errors: ["Plugin loading is disabled in Settings."]
    };
  }

  for (const file of files) {
    if (file.error) {
      errors.push(`${file.path}: ${file.error}`);
      continue;
    }

    if (!file.manifestJson?.trim()) {
      errors.push(`${file.path}: Plugin manifest is empty.`);
      continue;
    }

    try {
      const validation = validatePluginManifest(JSON.parse(file.manifestJson));
      if (!validation.ok || !validation.manifest) {
        errors.push(`${file.path}: ${validation.errors.join(" ")}`);
        continue;
      }

      loaded.push({
        path: file.path,
        manifest: validation.manifest
      });
    } catch (error) {
      errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    loaded,
    errors,
    promptTemplates: settings.allowPromptTemplates
      ? dedupeById(loaded.flatMap((plugin) => plugin.manifest.contributes.promptTemplates ?? []))
      : [],
    exportFormats: settings.allowExportFormats
      ? dedupeStrings(loaded.flatMap((plugin) => plugin.manifest.contributes.exportFormats ?? []))
      : [],
    practicePacks: settings.allowPracticePacks
      ? dedupeById(loaded.flatMap((plugin) => plugin.manifest.contributes.practicePacks ?? []))
      : []
  };
}

export function serializePluginCatalog(catalog: PluginCatalog): string {
  return JSON.stringify(catalog, null, 2);
}

export function parsePluginCatalog(raw: string | null | undefined): PluginCatalog {
  if (!raw?.trim()) {
    return createEmptyPluginCatalog();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PluginCatalog>;
    const loaded = Array.isArray(parsed.loaded)
      ? parsed.loaded.filter(isLoadedPlugin)
      : [];

    return {
      loaded,
      errors: Array.isArray(parsed.errors)
        ? parsed.errors.filter((error): error is string => typeof error === "string")
        : [],
      promptTemplates: Array.isArray(parsed.promptTemplates)
        ? parsed.promptTemplates.filter(isPromptTemplate)
        : [],
      exportFormats: Array.isArray(parsed.exportFormats)
        ? parsed.exportFormats.filter((format): format is string => typeof format === "string")
        : [],
      practicePacks: Array.isArray(parsed.practicePacks)
        ? parsed.practicePacks.filter((pack): pack is PluginPracticePack => validatePracticePack(pack))
        : []
    };
  } catch {
    return createEmptyPluginCatalog();
  }
}

function isLoadedPlugin(value: unknown): value is LoadedPlugin {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as LoadedPlugin;
  return typeof candidate.path === "string" && validatePluginManifest(candidate.manifest).ok;
}

function isPromptTemplate(value: unknown): value is PromptTemplate {
  const validation = validatePluginManifest({
    id: "template-check",
    name: "Template Check",
    version: "1.0.0",
    contributes: {
      promptTemplates: [value]
    }
  });

  return Boolean(validation.manifest?.contributes.promptTemplates?.length);
}

function validatePracticePack(value: unknown): boolean {
  const validation = validatePluginManifest({
    id: "practice-check",
    name: "Practice Check",
    version: "1.0.0",
    contributes: {
      practicePacks: [value]
    }
  });

  return Boolean(validation.manifest?.contributes.practicePacks?.length);
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function dedupeStrings(items: string[]): string[] {
  return [...new Set(items)];
}
