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

export interface GlobalActionShortcut {
  id: string;
  shortcut: string;
  onPressed: () => void;
  enabled?: boolean;
}

export interface GlobalActionShortcutRegistration {
  registeredShortcuts: Record<string, string>;
  errors: Record<string, string>;
  dispose: () => Promise<void>;
}

const defaultGlobalShortcutApi: GlobalShortcutApi = {
  isRegistered,
  register,
  unregister
};

export async function registerGlobalActionShortcuts(input: {
  actions: GlobalActionShortcut[];
  enabled?: boolean;
  api?: GlobalShortcutApi;
}): Promise<GlobalActionShortcutRegistration> {
  const api = input.api ?? defaultGlobalShortcutApi;
  const registeredShortcuts: Record<string, string> = {};
  const errors: Record<string, string> = {};
  const disposers: Array<() => Promise<void>> = [];

  if (!(input.enabled ?? isRunningInTauri())) {
    return {
      registeredShortcuts,
      errors,
      dispose: async () => undefined
    };
  }

  for (const action of input.actions) {
    const shortcut = normalizeShortcut(action.shortcut);
    if (!shortcut || action.enabled === false) {
      continue;
    }

    try {
      if (await api.isRegistered(shortcut)) {
        await api.unregister(shortcut);
      }

      await api.register(shortcut, (event) => {
        if (event.state === "Pressed") {
          action.onPressed();
        }
      });

      registeredShortcuts[action.id] = shortcut;
      disposers.push(() => api.unregister(shortcut));
    } catch (error) {
      errors[action.id] = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    registeredShortcuts,
    errors,
    dispose: async () => {
      await Promise.all(disposers.map((dispose) => dispose()));
    }
  };
}

export async function registerOverlayToggleShortcut(input: {
  shortcut: string;
  onToggle: () => void;
  enabled?: boolean;
  api?: GlobalShortcutApi;
}): Promise<OverlayShortcutRegistration> {
  const registeredShortcut = normalizeShortcut(input.shortcut);

  if (!registeredShortcut) {
    return {
      registeredShortcut,
      error: "No overlay shortcut is configured.",
      dispose: async () => undefined
    };
  }

  const registration = await registerGlobalActionShortcuts({
    enabled: input.enabled,
    api: input.api,
    actions: [
      {
        id: "overlay",
        shortcut: registeredShortcut,
        onPressed: input.onToggle
      }
    ]
  });

  return {
    registeredShortcut,
    error: registration.errors.overlay,
    dispose: registration.dispose
  };
}
