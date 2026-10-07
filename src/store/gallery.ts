import { create } from "zustand";

/**
 * Whether the template gallery ("New from template…") is open. A store of
 * its own because two places open it: the map menu, and the status line's
 * "Start from a template" on a first visit or an empty map (U12).
 */
export const useGallery = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
