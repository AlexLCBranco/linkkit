import { create } from "zustand";

import { exampleMap } from "../domain/example";
import { moveNodes, setPage } from "../domain/map";
import { defaultPageSize } from "../domain/page";
import type { LinkMap, NodeId, Point, Size } from "../domain/types";
import { loadActiveMapId, loadMap } from "./persistMap";

/**
 * The open map: the single source of truth. React Flow only draws what is
 * here; components read from it and call its actions, never edit a copy.
 *
 * For now there is one map and no editing (steps 5 and 8 add those). Every
 * action goes through a pure function from `domain/map.ts`.
 */
export interface MapState {
  readonly map: LinkMap;
  /** The map's boxes have never been placed (the example, on a first visit):
      the canvas measures them, tidies once, then calls `placeAll`. */
  readonly needsTidy: boolean;
  /** Puts every box where Tidy up said and sets the page size, in one change. */
  placeAll(positions: ReadonlyMap<NodeId, Point>, page: Size): void;
}

/**
 * A new map's page: as wide as the window allows (the prototype's numbers),
 * 560px tall. The canvas never shrinks it, only grows it to fit a layout.
 */
const NEW_PAGE = { minWidth: 360, maxWidth: 980, viewportGutter: 36, height: 560 };

function newPageSize(): Size {
  return defaultPageSize(typeof window === "undefined" ? NEW_PAGE.maxWidth : window.innerWidth, NEW_PAGE);
}

/** The map that was open last, or the example if there is none (or it was
    beyond repair). */
function initialState(): Pick<MapState, "map" | "needsTidy"> {
  const id = loadActiveMapId();
  const saved = id === null ? null : loadMap(id, newPageSize());
  return saved ? { map: saved, needsTidy: false } : { map: exampleMap(newPageSize()), needsTidy: true };
}

export const useMapStore = create<MapState>()((set) => ({
  ...initialState(),
  placeAll: (positions, page) => set((s) => ({ map: setPage(moveNodes(s.map, positions), page), needsTidy: false })),
}));
