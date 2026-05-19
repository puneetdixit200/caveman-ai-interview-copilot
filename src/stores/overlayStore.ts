import { create } from "zustand";

interface OverlayStore {
  visible: boolean;
  opacity: number;
  fontSize: number;
  locked: boolean;
  toggleVisible: () => void;
  setVisible: (visible: boolean) => void;
  setOpacity: (opacity: number) => void;
  setFontSize: (fontSize: number) => void;
  setLocked: (locked: boolean) => void;
}

export const useOverlayStore = create<OverlayStore>((set) => ({
  visible: true,
  opacity: 0.82,
  fontSize: 16,
  locked: false,
  toggleVisible: () => set((state) => ({ visible: !state.visible })),
  setVisible: (visible) => set({ visible }),
  setOpacity: (opacity) => set({ opacity: clamp(opacity, 0.1, 1) }),
  setFontSize: (fontSize) => set({ fontSize: Math.round(clamp(fontSize, 12, 28)) }),
  setLocked: (locked) => set({ locked })
}));

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

