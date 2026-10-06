import { create } from "zustand";

interface MissingMaps {
  /** Names of maps the saved list still had but whose content wasn't in
      storage when Linkkit opened. They have left the list. */
  readonly names: readonly string[];
  setMissing: (names: readonly string[]) => void;
  dismiss: () => void;
}

/**
 * What `features/maps/MissingMapsBanner.tsx` reports: set once, as Linkkit
 * opens (`initialState` in `mapStore.ts`), and cleared when the user closes
 * the banner. Never saved: by the next visit the list no longer names them,
 * so there is nothing left to report.
 */
export const useMissingMaps = create<MissingMaps>((set) => ({
  names: [],
  setMissing: (names) => set({ names }),
  dismiss: () => set({ names: [] }),
}));
