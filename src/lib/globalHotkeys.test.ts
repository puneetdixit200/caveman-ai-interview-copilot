import { describe, expect, it, vi } from "vitest";
import { registerOverlayToggleShortcut, type ShortcutHandler } from "./globalHotkeys";

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
});
