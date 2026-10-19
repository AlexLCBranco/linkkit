import { create } from "zustand";

/**
 * Page preferences that belong to no map: for now, whether the tips under
 * the header are open. Kept for the browser under one key, never with a
 * map (not in a backup, an export or a Boardkit link), and never written
 * on its own: only when the user changes one.
 *
 *   linkkit:ui-prefs   `{ "tips": "open" | "closed" }`; no `tips` (or no
 *                      key): the user hasn't chosen, so the window's width
 *                      decides (`TIPS_OPEN_FROM`)
 *
 * Storage that is full, blocked or unavailable just means the choice lasts
 * for this visit.
 */
const KEY = "linkkit:ui-prefs";

export type TipsChoice = "open" | "closed";

function load(): { tips?: TipsChoice } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    return raw.tips === "open" || raw.tips === "closed" ? { tips: raw.tips } : {};
  } catch {
    return {};
  }
}

export const useUiPrefs = create<{
  /** The user's choice, or `undefined` while they haven't made one. */
  tips: TipsChoice | undefined;
  setTips: (tips: TipsChoice) => void;
}>()((set) => ({
  tips: load().tips,
  setTips: (tips) => {
    try {
      // Read again first: another tab may have stored other preferences.
      let others: unknown = {};
      try {
        others = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      } catch {
        // Damaged: written over.
      }
      const kept = typeof others === "object" && others !== null && !Array.isArray(others) ? others : {};
      localStorage.setItem(KEY, JSON.stringify({ ...kept, tips }));
    } catch {
      // Storage full, blocked or unreadable: the choice still applies for this visit.
    }
    set({ tips });
  },
}));
