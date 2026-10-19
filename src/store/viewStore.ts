import { create } from "zustand";

import { shownMap } from "../domain/shown";
import type { LinkMap } from "../domain/types";
import { CENTERED, type Align, type PageAlign } from "../domain/page";
import { clampZoom } from "../domain/zoom";

const KEY = "linkkit:align";
/** Each map's zoom chosen with the pill, by map id: `{ "<id>": 1.5 }`,
    100% included. A map never zoomed has no entry (it opens fitted). */
const ZOOM_KEY = "linkkit:zoom";
/** Each bracket's hidden first rounds, by map id: `{ "<id>": 2 }`. A
    bracket showing every round has no entry. */
const ROUNDS_KEY = "linkkit:hiddenRounds";
/** Each bracket's first pinned round, by map id: `{ "<id>": 4 }`. A
    bracket with nothing pinned has no entry. */
const PINNED_KEY = "linkkit:pinnedRounds";

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
 * A map with no zoom of its own opens fitted to the window (owner,
 * 2026-10-19): `fits` holds that zoom for this visit only, never stored
 * (not in `linkkit:zoom`, not with the map). The pill wins: using it on a
 * map stores its own zoom, 100% too (owner, 2026-10-19: an explicit 100%
 * sticks), and the map is never fitted again.
 *
 * Hidden rounds are per map too (brackets only, the header's "Rounds"
 * menu): how many of the first rounds are off the page. Like zoom, a view
 * choice: no undo step, not in a backup. So is pinning the later rounds
 * (the same menu): from which round on they follow the screen down.
 */
export const useViewStore = create<{
  alignment: PageAlign;
  applied: number;
  zooms: Readonly<Record<string, number>>;
  /** This visit's fit-to-window zoom of maps with no zoom of their own. */
  fits: Readonly<Record<string, number>>;
  hiddenRounds: Readonly<Record<string, number>>;
  pinnedRounds: Readonly<Record<string, number>>;
  setAlign: (axis: "x" | "y", value: Align) => void;
  setZoom: (mapId: string, zoom: number) => void;
  /** Shows map `mapId` at `zoom` to fit the window, for this visit only. */
  setFit: (mapId: string, zoom: number) => void;
  /** Hides the first `rounds` rounds of bracket `mapId` (0: shows all). */
  setHiddenRounds: (mapId: string, rounds: number) => void;
  /** Pins bracket `mapId`'s rounds from round `round` on (0: none). */
  setPinnedFrom: (mapId: string, round: number) => void;
}>()((set, get) => ({
  alignment: load(),
  applied: 0,
  zooms: loadNumbers(ZOOM_KEY, clampZoom),
  fits: {},
  hiddenRounds: loadNumbers(ROUNDS_KEY, (n) => (n >= 1 ? Math.floor(n) : null)),
  pinnedRounds: loadNumbers(PINNED_KEY, (n) => (n >= 2 ? Math.floor(n) : null)),
  setAlign: (axis, value) => {
    const alignment = { ...get().alignment, [axis]: value };
    try {
      localStorage.setItem(KEY, JSON.stringify(alignment));
    } catch {
      // Storage full or blocked: the choice still applies for this visit.
    }
    set({ alignment, applied: get().applied + 1 });
  },
  setZoom: (mapId, zoom) => {
    const { [mapId]: _fit, ...fits } = get().fits;
    set({
      // Every value stored, 100% too (`NaN` never equals one): a choice.
      zooms: saveNumber(ZOOM_KEY, get().zooms, mapId, clampZoom(zoom), Number.NaN),
      fits,
    });
  },
  setFit: (mapId, zoom) => set({ fits: { ...get().fits, [mapId]: zoom } }),
  setHiddenRounds: (mapId, rounds) =>
    set({ hiddenRounds: saveNumber(ROUNDS_KEY, get().hiddenRounds, mapId, Math.max(0, Math.floor(rounds) || 0), 0) }),
  setPinnedFrom: (mapId, round) => {
    const from = Math.floor(round) || 0;
    set({ pinnedRounds: saveNumber(PINNED_KEY, get().pinnedRounds, mapId, from >= 2 ? from : 0, 0) });
  },
}));

/** The zoom a map is drawn at: its own (the pill's), else this visit's
    fit to the window, else 100%. */
export const zoomOf = (s: { zooms: Readonly<Record<string, number>>; fits: Readonly<Record<string, number>> }, mapId: string): number =>
  s.zooms[mapId] ?? s.fits[mapId] ?? 1;

/** Whether map `mapId` opens fitted to the window: the pill was never
    used on it. */
export const fitsOnOpen = (s: { zooms: Readonly<Record<string, number>> }, mapId: string): boolean => s.zooms[mapId] === undefined;

/** How many of a bracket's first rounds are hidden (0: none). Pass it to
    `shownMap`, which also keeps it in range for the map. */
export const roundsHiddenOf = (hiddenRounds: Readonly<Record<string, number>>, mapId: string): number => hiddenRounds[mapId] ?? 0;

/** The round a bracket's pinned rounds start from (0: none pinned). */
export const pinnedFromOf = (pinnedRounds: Readonly<Record<string, number>>, mapId: string): number => pinnedRounds[mapId] ?? 0;

/** The map as it shows now, read outside rendering: with a bracket's
    hidden rounds off the page too (`shownMap`). */
export const shownNow = (map: LinkMap): LinkMap => shownMap(map, roundsHiddenOf(useViewStore.getState().hiddenRounds, map.id));
