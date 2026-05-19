import { invoke } from "@tauri-apps/api/core";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isRunningInTauri(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export async function invokeOrFallback<T>(
  command: string,
  args: Record<string, unknown>,
  fallback: () => T | Promise<T>
): Promise<T> {
  if (!isRunningInTauri()) {
    return fallback();
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.error(`Tauri command failed: ${command}`, error);
    return fallback();
  }
}

