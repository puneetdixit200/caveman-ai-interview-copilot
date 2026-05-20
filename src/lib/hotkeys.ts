export const DEFAULT_OVERLAY_SHORTCUT = "CommandOrControl+Shift+H";
export const DEFAULT_CAPTURE_SHORTCUT = "CommandOrControl+Shift+S";
export const DEFAULT_GENERATE_SHORTCUT = "CommandOrControl+Shift+G";

export function normalizeShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => normalizeShortcutPart(part.trim()))
    .filter(Boolean)
    .join("+");
}

export function overlayShortcutLabel(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => (part === "CommandOrControl" ? "Ctrl/Command" : part))
    .join(" + ");
}

function normalizeShortcutPart(part: string): string {
  const lower = part.toLowerCase();
  if (lower === "ctrl" || lower === "control" || lower === "cmdorctrl" || lower === "commandorcontrol") {
    return "CommandOrControl";
  }

  if (lower === "cmd" || lower === "command" || lower === "meta") {
    return "Command";
  }

  if (lower === "shift") {
    return "Shift";
  }

  if (lower === "alt" || lower === "option") {
    return "Alt";
  }

  if (lower === "space") {
    return "Space";
  }

  return part.length === 1 ? part.toUpperCase() : part;
}
