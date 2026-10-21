import { createStore, type StoreApi } from "zustand";

import { EMPTY_HISTORY } from "../../domain/history";
import { moveNodes, setPage } from "../../domain/map";
import { shareUnchanged } from "../../domain/merge";
import type { LinkMap, MapId } from "../../domain/types";
import { newPageSize, useMapStore, type MapState } from "../../store/mapStore";
import { peekMap } from "../../store/persistMap";

/** What a map on the whiteboard shows while nobody edits it. `deleted`: in
    Linkkit's trash. */
export type DisplayStatus = "ok" | "missing" | "deleted" | "damaged";

export interface DisplayMap {
  readonly status: DisplayStatus;
  readonly store: StoreApi<MapState> | null;
}

const NOTHING = () => {};

/**
 * A read-only map store for a map drawn on the whiteboard but not being
 * edited: the same shape as the app's store, so `MapCanvas`, `BoxView` and
 * the rest draw it unchanged. Read straight from the saved record
 * (`peekMap`), never written; every action does nothing, except that boxes
 * Boardkit made since (a linked tree's, still to be placed) are laid out
 * in this copy only, as opening the map would (Linkkit stores that layout
 * when the map is next opened for editing).
 */
export function readDisplayMap(mapId: string, previous?: StoreApi<MapState> | null): DisplayMap {
  const read = peekMap(mapId as MapId, newPageSize());
  if (read.status !== "ok") {
    return { status: read.status === "trashed" ? "deleted" : read.status === "missing" ? "missing" : "damaged", store: null };
  }
  if (previous) {
    const now = previous.getState();
    previous.setState({ map: shareUnchanged(now.map, read.map), needsTidy: read.unplaced });
    return { status: "ok", store: previous };
  }
  return { status: "ok", store: createStore<MapState>((set) => displayState(read.map, read.unplaced, set)) };
}

function displayState(map: LinkMap, needsTidy: boolean, set: StoreApi<MapState>["setState"]): MapState {
  const template = useMapStore.getState();
  const inert = Object.fromEntries(Object.entries(template).map(([key, value]) => [key, typeof value === "function" ? NOTHING : value]));
  return {
    ...(inert as unknown as MapState),
    map,
    needsTidy,
    maps: [],
    starter: null,
    trashedMaps: [],
    histories: {},
    history: EMPTY_HISTORY,
    selected: null,
    hovered: null,
    hoveredSlot: null,
    group: [],
    clipboard: null,
    editing: null,
    connecting: null,
    dropping: null,
    selectedLink: null,
    relinking: null,
    stepKey: null,
    settleRequest: 0,
    placeRequest: null,
    confirmingDelete: null,
    editAfterTidy: null,
    renameSettle: null,
    glideRequest: null,
    trashWarning: null,
    notesOpen: false,
    // The one action that does something: placing boxes still to be
    // placed, in this copy only.
    placeAll: (positions, page) =>
      set((s) => {
        const moved = moveNodes(s.map, positions);
        return { map: page ? setPage(moved, page) : moved, needsTidy: false };
      }),
  };
}
