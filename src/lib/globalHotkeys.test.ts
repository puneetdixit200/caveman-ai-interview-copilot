import { describe, expect, it, vi } from "vitest";
import { registerGlobalActionShortcuts, registerOverlayToggleShortcut, type ShortcutHandler } from "./globalHotkeys";

describe("globalHotkeys", () => {
  it("registers the overlay shortcut and toggles only on key press", async () => {
    let handler: ShortcutHandler | undefined;
    const onToggle = vi.fn();
    const api = {
      isRegistered: vi.fn(async () => false),
      register: vi.fn(async (_shortcut: string, nextHandler: ShortcutHandler) => {
        handler = nextHandler;
      }),
      unregister: vi.fn(async () => undefined)
    };

    const registration = await registerOverlayToggleShortcut({
      shortcut: "Ctrl+Shift+H",
      onToggle,
      enabled: true,
      api
    });

    expect(registration.registeredShortcut).toBe("CommandOrControl+Shift+H");
    expect(api.register).toHaveBeenCalledWith("CommandOrControl+Shift+H", expect.any(Function));

    handler?.({ shortcut: "CommandOrControl+Shift+H", id: 1, state: "Released" });
    expect(onToggle).not.toHaveBeenCalled();

    handler?.({ shortcut: "CommandOrControl+Shift+H", id: 1, state: "Pressed" });
    expect(onToggle).toHaveBeenCalledTimes(1);

    await registration.dispose();
    expect(api.unregister).toHaveBeenCalledWith("CommandOrControl+Shift+H");
  });

  it("registers multiple interview action shortcuts and cleans them up together", async () => {
    const handlers = new Map<string, ShortcutHandler>();
    const onCapture = vi.fn();
    const onGenerate = vi.fn();
    const api = {
      isRegistered: vi.fn(async (shortcut: string) => shortcut === "CommandOrControl+Shift+S"),
      register: vi.fn(async (shortcut: string, nextHandler: ShortcutHandler) => {
        handlers.set(shortcut, nextHandler);
      }),
      unregister: vi.fn(async () => undefined)
    };

    const registration = await registerGlobalActionShortcuts({
      enabled: true,
      api,
      actions: [
        {
          id: "capture",
          shortcut: "Ctrl+Shift+S",
          onPressed: onCapture
        },
        {
          id: "generate",
          shortcut: "Ctrl+Shift+G",
          onPressed: onGenerate
        }
      ]
    });

    expect(registration.errors).toEqual({});
    expect(registration.registeredShortcuts).toEqual({
      capture: "CommandOrControl+Shift+S",
      generate: "CommandOrControl+Shift+G"
    });
    expect(api.unregister).toHaveBeenCalledWith("CommandOrControl+Shift+S");

    handlers.get("CommandOrControl+Shift+S")?.({ shortcut: "CommandOrControl+Shift+S", id: 1, state: "Pressed" });
    handlers.get("CommandOrControl+Shift+G")?.({ shortcut: "CommandOrControl+Shift+G", id: 2, state: "Pressed" });

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledTimes(1);

    await registration.dispose();
    expect(api.unregister).toHaveBeenCalledWith("CommandOrControl+Shift+G");
  });
});
