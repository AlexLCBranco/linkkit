import { create } from "zustand";

import type { Point } from "../domain/types";

/**
 * A short hint shown right where the user acted, when something they tried
 * is refused ("In a tree every box needs a parent: ..."): the app never
 * ignores an action silently. `features/map/HintBubble.tsx` draws it on
 * the page at `at` (page pixels) for a few seconds. View state only: never
 * saved, never undone.
 */
interface HintState {
  /** `seq` tells a repeat of the same hint apart, so it shows again. */
  readonly hint: { readonly seq: number; readonly text: string; readonly at: Point } | null;
  show: (text: string, at: Point) => void;
  clear: () => void;
}

export const useHint = create<HintState>((set, get) => ({
  hint: null,
  show: (text, at) => set({ hint: { seq: (get().hint?.seq ?? 0) + 1, text, at } }),
  clear: () => {
    if (get().hint) set({ hint: null });
  },
}));
