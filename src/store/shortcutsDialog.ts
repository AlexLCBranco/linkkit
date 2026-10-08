import { create } from "zustand";

/**
 * Whether the keyboard shortcuts dialog is open. A store, not the dialog's
 * own state, because two things open it: its header button and the `?`
 * key, which the map's key handler catches. View state only: never saved.
 */
export const useShortcutsDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
