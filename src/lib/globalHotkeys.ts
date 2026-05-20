import {
  isRegistered,
  register,
  unregister,
  type ShortcutEvent as TauriShortcutEvent
} from "@tauri-apps/plugin-global-shortcut";
import { normalizeShortcut } from "./hotkeys";
import { isRunningInTauri } from "./tauri";

export type ShortcutEvent = TauriShortcutEvent;
export type ShortcutHandler = (event: ShortcutEvent) => void;

export interface GlobalShortcutApi {
  isRegistered: (shortcut: string) => Promise<boolean>;
  register: (shortcut: string, handler: ShortcutHandler) => Promise<void>;
  unregister: (shortcut: string) => Promise<void>;
}

export interface OverlayShortcutRegistration {
  registeredShortcut: string;
  dispose: () => Promise<void>;
  error?: string;
}

const defaultGlobalShortcutApi: GlobalShortcutApi = {
  isRegistered,
  register,
  unregister
};

export async function registerOverlayToggleShortcut(input: {
  shortcut: string;
  onToggle: () => void;
  enabled?: boolean;
  api?: GlobalShortcutApi;
}): Promise<OverlayShortcutRegistration> {
  const registeredShortcut = normalizeShortcut(input.shortcut);
  const api = input.api ?? defaultGlobalShortcutApi;

  if (!registeredShortcut) {
    return {
      registeredShortcut,
      error: "No overlay shortcut is configured.",
      dispose: async () => undefined
    };
  }

  if (!(input.enabled ?? isRunningInTauri())) {
    return {
      registeredShortcut,
      dispose: async () => undefined
    };
  }

  try {
    if (await api.isRegistered(registeredShortcut)) {
      await api.unregister(registeredShortcut);
    }

    await api.register(registeredShortcut, (event) => {
      if (event.state === "Pressed") {
        input.onToggle();
      }
    });

    return {
      registeredShortcut,
      dispose: () => api.unregister(registeredShortcut)
    };
  } catch (error) {
    return {
      registeredShortcut,
      error: error instanceof Error ? error.message : String(error),
      dispose: async () => undefined
    };
  }
}
