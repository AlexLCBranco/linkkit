import { create } from "zustand";

import { CENTERED, type Align, type PageAlign } from "../domain/page";
import { clampZoom } from "../domain/zoom";

const KEY = "linkkit:align";
/** Each map's zoom, by map id: `{ "<id>": 1.5 }`. A map at 100% has no entry. */
const ZOOM_KEY = "linkkit:zoom";

const isAlign = (v: unknown): v is Align => v === "start" || v === "center" || v === "end";

function load(): PageAlign {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    return { x: isAlign(raw.x) ? raw.x : CENTERED.x, y: isAlign(raw.y) ? raw.y : CENTERED.y };
  } catch {
    return CENTERED;
  }
}

function loadZooms(): Readonly<Record<string, number>> {
  try {
    const raw = JSON.parse(localStorage.getItem(ZOOM_KEY) ?? "{}") as Record<string, unknown>;
    const zooms: Record<string, number> = {};
    for (const [id, z] of Object.entries(raw)) {
      if (typeof z === "number" && Number.isFinite(z)) zooms[id] = clampZoom(z);
    }
    return zooms;
  } catch {
    return {};
  }
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
 */
export const useViewStore = create<{
  alignment: PageAlign;
  applied: number;
  zooms: Readonly<Record<string, number>>;
  setAlign: (axis: "x" | "y", value: Align) => void;
  setZoom: (mapId: string, zoom: number) => void;
}>()((set, get) => ({
  alignment: load(),
  applied: 0,
  zooms: loadZooms(),
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
    const z = clampZoom(zoom);
    const { [mapId]: _old, ...others } = get().zooms;
    const zooms = z === 1 ? others : { ...others, [mapId]: z };
    try {
      localStorage.setItem(ZOOM_KEY, JSON.stringify(zooms));
    } catch {
      // As above: the zoom still applies for this visit.
    }
    set({ zooms });
  },
}));

/** The zoom a map is drawn at (100% unless chosen otherwise). */
export const zoomOf = (zooms: Readonly<Record<string, number>>, mapId: string): number => zooms[mapId] ?? 1;
