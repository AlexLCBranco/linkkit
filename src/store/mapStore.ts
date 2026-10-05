import { create } from "zustand";

import { exampleMap } from "../domain/example";
import {
  addLink,
  addNode,
  cleanName,
  deleteLink,
  deleteNode,
  moveNode,
  moveNodes,
  renameNode,
  setLinkLabel,
  setPage,
} from "../domain/map";
import { defaultPageSize } from "../domain/page";
import type { LinkId, LinkMap, NodeId, Point, Size } from "../domain/types";
import { loadActiveMapId, loadMap } from "./persistMap";

/** What is open for typing: a box's name or an arrow's label. */
export type Editing = { readonly kind: "box"; readonly id: NodeId } | { readonly kind: "link"; readonly id: LinkId };

/** An arrow being dragged out of a box's dot, not yet dropped. */
export interface Connecting {
  readonly from: NodeId;
  /** The pointer, in page pixels. */
  readonly at: Point;
  /** The box under the pointer, if the rules allow an arrow to it. */
  readonly target: NodeId | null;
}

/**
 * The open map: the single source of truth. React Flow only draws what is
 * here; components read from it and call its actions, never edit a copy.
 *
 * Every edit goes through a pure function from `domain/map.ts`, which
 * returns the same map object when nothing changed (so nothing re-renders
 * and nothing is saved).
 *
 * `selected`, `editing` and `connecting` live here too, so any component
 * can read them, but they are view state: never saved, and a reload starts
 * without them.
 */
export interface MapState {
  readonly map: LinkMap;
  /** The map's boxes have never been placed (the example, on a first visit):
      the canvas measures them, tidies once, then calls `placeAll`. */
  readonly needsTidy: boolean;
  /** The box whose needs / breaks are highlighted, or `null`. */
  readonly selected: NodeId | null;
  readonly editing: Editing | null;
  readonly connecting: Connecting | null;
  /** Bumped by the "Tidy up" button. The canvas, which knows every box's
      measured size, watches it, tidies and glides the boxes there. */
  readonly tidyRequest: number;

  /** Puts every box where Tidy up said and sets the page size, in one change. */
  placeAll(positions: ReadonlyMap<NodeId, Point>, page: Size): void;
  /** Selects a box (`null` clears the selection). */
  select(id: NodeId | null): void;
  /** Asks the canvas to tidy the map up (see `tidyRequest`). */
  requestTidy(): void;
  /** Sets the page's size (the corner grip and the "More room" tab). */
  resizePage(size: Size): void;

  /** Adds a nameless box with its centre at `at` and opens its name for
      typing. */
  addBox(at: Point): NodeId;
  /** An empty name is ignored: a box keeps its old name rather than going
      blank. */
  renameBox(id: NodeId, name: string): void;
  moveBox(id: NodeId, to: Point): void;
  /** Moves several boxes at once (keeping boxes on the page). */
  moveBoxes(positions: ReadonlyMap<NodeId, Point>): void;
  /** Deletes a box and every arrow touching it. */
  deleteBox(id: NodeId): void;

  /** Draws an arrow (`from` needs `to`) if the map's rules allow it. */
  connect(from: NodeId, to: NodeId): boolean;
  setConnecting(connecting: Connecting | null): void;
  /** An emptied label goes back to "needs". */
  setLinkLabel(id: LinkId, label: string): void;
  deleteLink(id: LinkId): void;

  startEditing(editing: Editing): void;
  /** Ends typing. A box still without a name is removed (as in the
      prototype: a box added by mistake goes away on Escape). */
  stopEditing(): void;
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

/** Drops view state that points at something no longer on the map. */
function forget(s: MapState, map: LinkMap): Partial<MapState> {
  const gone = (e: Editing | null) => e !== null && !(e.kind === "box" ? map.nodes[e.id] : map.links[e.id]);
  return {
    map,
    selected: s.selected && map.nodes[s.selected] ? s.selected : null,
    editing: gone(s.editing) ? null : s.editing,
  };
}

export const useMapStore = create<MapState>()((set, get) => ({
  ...initialState(),
  selected: null,
  editing: null,
  connecting: null,
  tidyRequest: 0,

  placeAll: (positions, page) => set((s) => ({ map: setPage(moveNodes(s.map, positions), page), needsTidy: false })),
  select: (id) => set({ selected: id }),
  requestTidy: () => set((s) => ({ tidyRequest: s.tidyRequest + 1 })),
  resizePage: (size) => set((s) => ({ map: setPage(s.map, size) })),

  addBox: (at) => {
    const { map, nodeId } = addNode(get().map, at);
    set({ map, editing: { kind: "box", id: nodeId } });
    return nodeId;
  },
  renameBox: (id, name) => {
    if (!cleanName(name)) return;
    set((s) => ({ map: renameNode(s.map, id, name) }));
  },
  moveBox: (id, to) => set((s) => ({ map: moveNode(s.map, id, to) })),
  moveBoxes: (positions) => set((s) => ({ map: moveNodes(s.map, positions) })),
  deleteBox: (id) => set((s) => forget(s, deleteNode(s.map, id))),

  connect: (from, to) => {
    const added = addLink(get().map, from, to);
    if (added.linkId === null) return false;
    set({ map: added.map });
    return true;
  },
  setConnecting: (connecting) => set({ connecting }),
  setLinkLabel: (id, label) => set((s) => ({ map: setLinkLabel(s.map, id, label) })),
  deleteLink: (id) => set((s) => forget(s, deleteLink(s.map, id))),

  startEditing: (editing) => set({ editing }),
  stopEditing: () =>
    set((s) => {
      const e = s.editing;
      if (e?.kind === "box" && s.map.nodes[e.id]?.name === "") {
        return { ...forget(s, deleteNode(s.map, e.id)), editing: null };
      }
      return { editing: null };
    }),
}));
