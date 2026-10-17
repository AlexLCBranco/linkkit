import { create } from "zustand";

import { shownMap } from "../domain/shown";
import type { LinkMap } from "../domain/types";
import { CENTERED, type Align, type PageAlign } from "../domain/page";
import { clampZoom } from "../domain/zoom";

const KEY = "linkkit:align";
/** Each map's zoom, by map id: `{ "<id>": 1.5 }`. A map at 100% has no entry. */
const ZOOM_KEY = "linkkit:zoom";
/** Each bracket's hidden first rounds, by map id: `{ "<id>": 2 }`. A
    bracket showing every round has no entry. */
const ROUNDS_KEY = "linkkit:hiddenRounds";

const isAlign = (v: unknown): v is Align => v === "start" || v === "center" || v === "end";

function load(): PageAlign {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    return { x: isAlign(raw.x) ? raw.x : CENTERED.x, y: isAlign(raw.y) ? raw.y : CENTERED.y };
  } catch {
    return CENTERED;
  }
}

/** A saved `{ mapId: number }` record, each number passed through `keep`
    (`null`: left out). Anything damaged is ignored. */
function loadNumbers(key: string, keep: (n: number) => number | null): Readonly<Record<string, number>> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [id, n] of Object.entries(raw)) {
      const kept = typeof n === "number" && Number.isFinite(n) ? keep(n) : null;
      if (kept !== null) out[id] = kept;
    }
    return out;
  } catch {
    return {};
  }
}

/** `record` with `id` set to `value`, or left out when it is `none`
    (the default), and saved under `key`. */
function saveNumber(key: string, record: Readonly<Record<string, number>>, id: string, value: number, none: number) {
  const { [id]: _old, ...others } = record;
  const next = value === none ? others : { ...others, [id]: value };
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the choice still applies for this visit.
  }
  return next;
}

/**
 * View preferences, as in Treekit: where the whole map sits on the screen,
 * and how big it is drawn. Not part of any map, so not saved with one (nor
 * in an export, nor in a Boardkit link); remembered for the browser
 * instead. Choosing a spot moves the map's boxes there (an undoable change
 * the canvas makes, since only it knows the boxes' sizes), and Tidy up
 * places the map there too. `applied` counts presses, so pressing the
 * spot already chosen moves the map back to it after a drag.
 *
 * Zoom is per map (unlike Treekit's, which is one for the visit): each map
 * opens at the zoom it was left at, even after a reload. It never moves a
 * box; it only scales the drawing.
 *
 * Hidden rounds are per map too (brackets only, the header's "Rounds"
 * menu): how many of the first rounds are off the page. Like zoom, a view
 * choice: no undo step, not in a backup.
 */
export const useViewStore = create<{
  alignment: PageAlign;
  applied: number;
  zooms: Readonly<Record<string, number>>;
  hiddenRounds: Readonly<Record<string, number>>;
  setAlign: (axis: "x" | "y", value: Align) => void;
  setZoom: (mapId: string, zoom: number) => void;
  /** Hides the first `rounds` rounds of bracket `mapId` (0: shows all). */
  setHiddenRounds: (mapId: string, rounds: number) => void;
}>()((set, get) => ({
  alignment: load(),
  applied: 0,
  zooms: loadNumbers(ZOOM_KEY, clampZoom),
  hiddenRounds: loadNumbers(ROUNDS_KEY, (n) => (n >= 1 ? Math.floor(n) : null)),
  setAlign: (axis, value) => {
    const alignment = { ...get().alignment, [axis]: value };
    try {
      localStorage.setItem(KEY, JSON.stringify(alignment));
    } catch {
      // Storage full or blocked: the choice still applies for this visit.
    }
    set({ alignment, applied: get().applied + 1 });
  },
  setZoom: (mapId, zoom) => set({ zooms: saveNumber(ZOOM_KEY, get().zooms, mapId, clampZoom(zoom), 1) }),
  setHiddenRounds: (mapId, rounds) =>
    set({ hiddenRounds: saveNumber(ROUNDS_KEY, get().hiddenRounds, mapId, Math.max(0, Math.floor(rounds) || 0), 0) }),
}));

/** The zoom a map is drawn at (100% unless chosen otherwise). */
export const zoomOf = (zooms: Readonly<Record<string, number>>, mapId: string): number => zooms[mapId] ?? 1;

/** How many of a bracket's first rounds are hidden (0: none). Pass it to
    `shownMap`, which also keeps it in range for the map. */
export const roundsHiddenOf = (hiddenRounds: Readonly<Record<string, number>>, mapId: string): number => hiddenRounds[mapId] ?? 0;

/** The map as it shows now, read outside rendering: with a bracket's
    hidden rounds off the page too (`shownMap`). */
export const shownNow = (map: LinkMap): LinkMap => shownMap(map, roundsHiddenOf(useViewStore.getState().hiddenRounds, map.id));
