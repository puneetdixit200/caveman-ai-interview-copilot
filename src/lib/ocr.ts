import type { OcrSettings, ProviderKind } from "../types/settings";

export function normalizeOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function canSendOcrContext(input: {
  settings: OcrSettings;
  reviewed: boolean;
  providerKind: ProviderKind;
  localOnlyMode: boolean;
}): boolean {
  if (!input.settings.enabled || !input.settings.includeInPrompt) {
    return false;
  }

  if (input.settings.reviewBeforeSend && !input.reviewed) {
    return false;
  }

  if (input.localOnlyMode && input.providerKind === "cloud") {
    return false;
  }

  return true;
}
