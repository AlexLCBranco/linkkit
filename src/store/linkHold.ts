import { create } from "zustand";

import type { MapId } from "../domain/types";

/** Why a linked tree can't be changed: its board was saved by a newer
    Boardkit, or doesn't read cleanly (Boardkit repairs it when opened). */
export type HoldReason = "newer" | "damaged";

interface LinkHold {
  /** Linked maps open read-only, and why. */
  readonly held: Readonly<Record<MapId, HoldReason>>;
  hold: (id: MapId, reason: HoldReason) => void;
  release: (id: MapId) => void;
}

/**
 * Linked trees whose board Linkkit can't write (shared store design: a
 * board from a newer version opens read-only with a message). Such a map
 * shows Linkkit's last copy, every edit is refused, and nothing is saved;
 * the banner (`features/maps/LinkHoldBanner.tsx`) says why. Released as
 * soon as the board reads cleanly again. Never saved.
 */
export const useLinkHold = create<LinkHold>((set, get) => ({
  held: {},
  hold: (id, reason) => {
    if (get().held[id] !== reason) set((s) => ({ held: { ...s.held, [id]: reason } }));
  },
  release: (id) => {
    if (!get().held[id]) return;
    set((s) => {
      const { [id]: _, ...held } = s.held;
      return { held };
    });
  },
}));
