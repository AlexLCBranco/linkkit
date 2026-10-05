import { create } from "zustand";

import { CENTERED, type Align, type PageAlign } from "../domain/page";

const KEY = "linkkit:align";

const isAlign = (v: unknown): v is Align => v === "start" || v === "center" || v === "end";

function load(): PageAlign {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    return { x: isAlign(raw.x) ? raw.x : CENTERED.x, y: isAlign(raw.y) ? raw.y : CENTERED.y };
  } catch {
    return CENTERED;
  }
}

/**
 * View preferences, as in Treekit: where the whole map sits on the screen.
 * Not part of any map, so not saved with one; remembered for the browser
 * instead. Choosing a spot moves the map's boxes there (an undoable change
 * the canvas makes, since only it knows the boxes' sizes), and Tidy up
 * places the map there too. `applied` counts presses, so pressing the
 * spot already chosen moves the map back to it after a drag.
 */
export const useViewStore = create<{
  alignment: PageAlign;
  applied: number;
  setAlign: (axis: "x" | "y", value: Align) => void;
}>()((set, get) => ({
  alignment: load(),
  applied: 0,
  setAlign: (axis, value) => {
    const alignment = { ...get().alignment, [axis]: value };
    try {
      localStorage.setItem(KEY, JSON.stringify(alignment));
    } catch {
      // Storage full or blocked: the choice still applies for this visit.
    }
    set({ alignment, applied: get().applied + 1 });
  },
}));
