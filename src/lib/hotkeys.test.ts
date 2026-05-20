import { describe, expect, it } from "vitest";
import { normalizeShortcut, overlayShortcutLabel } from "./hotkeys";

describe("hotkeys", () => {
  it("normalizes common shortcut spellings for Tauri global-shortcut", () => {
    expect(normalizeShortcut("Ctrl+Shift+H")).toBe("CommandOrControl+Shift+H");
    expect(normalizeShortcut("control + alt + space")).toBe("CommandOrControl+Alt+Space");
  });

  it("keeps a readable overlay shortcut label", () => {
    expect(overlayShortcutLabel("CommandOrControl+Shift+H")).toBe("Ctrl/Command + Shift + H");
  });
});
