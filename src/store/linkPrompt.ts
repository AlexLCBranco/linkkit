import { create } from "zustand";

import type { NodeId } from "../domain/types";

interface LinkPromptStore {
  /** The box whose link field is open, or `null`. One at a time. */
  readonly box: NodeId | null;
  /** Where the field opens, in viewport pixels (its top-left corner). */
  readonly at: { readonly x: number; readonly y: number };
  open: (box: NodeId, at: { readonly x: number; readonly y: number }) => void;
  close: () => void;
}

/**
 * Which box's link field is open (features/map/LinkPromptHost.tsx draws
 * it). Transient UI state: never saved, never undone. Opened from the
 * box's right-click menu or Ctrl+K; saving is one undo step of the map.
 */
export const useLinkPrompt = create<LinkPromptStore>((set) => ({
  box: null,
  at: { x: 0, y: 0 },
  open: (box, at) => set({ box, at }),
  close: () => set((s) => (s.box === null ? s : { box: null })),
}));
