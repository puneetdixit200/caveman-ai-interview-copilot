import { beforeEach, describe, expect, it } from "vitest";
import { useOverlayStore } from "./overlayStore";

describe("overlayStore", () => {
  beforeEach(() => {
    useOverlayStore.setState({
      visible: true,
      opacity: 0.82,
      fontSize: 16,
      locked: false
    });
  });

  it("toggles overlay visibility", () => {
    useOverlayStore.getState().toggleVisible();
    expect(useOverlayStore.getState().visible).toBe(false);
  });

  it("clamps opacity to the stealth overlay range", () => {
    useOverlayStore.getState().setOpacity(0.04);
    expect(useOverlayStore.getState().opacity).toBe(0.1);

    useOverlayStore.getState().setOpacity(2);
    expect(useOverlayStore.getState().opacity).toBe(1);
  });
});

