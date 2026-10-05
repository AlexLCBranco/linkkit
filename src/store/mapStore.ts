import { create } from "zustand";

import { exampleMap } from "../domain/example";
import * as history from "../domain/history";
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
  setNodeColor,
  setPage,
} from "../domain/map";
import { defaultPageSize } from "../domain/page";
import type { LinkId, LinkMap, NodeId, PaletteColor, Point, Size } from "../domain/types";
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
 * and nothing is saved), and then through `commit`, which records it for
 * undo in the same `set`: no edit can forget to be undoable.
 *
 * `selected`, `editing` and `connecting` live here too, so any component
 * can read them, but they are view state: never saved, never undone, and a
 * reload starts without them. So is the undo history: it lasts the session.
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
  readonly history: history.History;
  /** Which edit the latest undo step belongs to (a drag, a new box being
      named), so the next edit with the same key joins that step instead of
      making its own. `null`: the next edit is a step of its own. */
  readonly stepKey: string | null;

  /** Puts every box where Tidy up said and sets the page size, in one change. */
  placeAll(positions: ReadonlyMap<NodeId, Point>, page: Size): void;
  /** Selects a box (`null` clears the selection). */
  select(id: NodeId | null): void;
  /** Asks the canvas to tidy the map up (see `tidyRequest`). */
  requestTidy(): void;
  /** Sets the page's size (the corner grip and the "More room" tab). */
  resizePage(size: Size): void;
  undo(): void;
  redo(): void;

  /** Adds a nameless box with its centre at `at` and opens its name for
      typing. */
  addBox(at: Point): NodeId;
  /** An empty name is ignored: a box keeps its old name rather than going
      blank. */
  renameBox(id: NodeId, name: string): void;
  /** Moves a box. Moves with the same `gesture` (one drag) are one undo
      step. */
  moveBox(id: NodeId, to: Point, gesture?: string): void;
  /** Moves boxes back onto the page after a change made them stick out (a
      longer name). Part of that change, so it joins the latest undo step. */
  nudgeBoxes(positions: ReadonlyMap<NodeId, Point>): void;
  /** `null` clears the colour. */
  setBoxColor(id: NodeId, color: PaletteColor | null): void;
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
function forget(s: MapState, map: LinkMap): Pick<MapState, "map" | "selected" | "editing"> {
  const gone = (e: Editing | null) => e !== null && !(e.kind === "box" ? map.nodes[e.id] : map.links[e.id]);
  return {
    map,
    selected: s.selected && map.nodes[s.selected] ? s.selected : null,
    editing: gone(s.editing) ? null : s.editing,
  };
}

/**
 * One undoable edit: the new map plus its undo step, and anything selected
 * or open that the edit deleted is let go. An edit with the same `key` as
 * the latest step joins it (see `stepKey`).
 */
function commit(s: MapState, next: LinkMap, key: string | null = null): Partial<MapState> {
  if (next === s.map) return {};
  const join = key !== null && key === s.stepKey;
  return {
    ...forget(s, next),
    history: join ? history.amendLast(s.history, s.map, next) : history.record(s.history, s.map, next),
    stepKey: key,
  };
}

/** The undo step a new box and its first name share. */
const newBoxKey = (id: NodeId) => `new:${id}`;

export const useMapStore = create<MapState>()((set, get) => ({
  ...initialState(),
  selected: null,
  editing: null,
  connecting: null,
  tidyRequest: 0,
  history: history.EMPTY_HISTORY,
  stepKey: null,

  // The example's first tidy places boxes that were never shown anywhere
  // else: not something to undo back to.
  placeAll: (positions, page) =>
    set((s) => {
      const next = setPage(moveNodes(s.map, positions), page);
      return s.needsTidy ? { map: next, needsTidy: false } : commit(s, next);
    }),
  select: (id) => set({ selected: id }),
  requestTidy: () => set((s) => ({ tidyRequest: s.tidyRequest + 1 })),
  resizePage: (size) => set((s) => commit(s, setPage(s.map, size))),

  // Undo and redo apply a recorded patch directly; they never go through
  // `commit`, or undoing would record an "undo the undo" step. Typing is
  // finished first, as if clicked away: otherwise undoing a new box still
  // being named, then redoing, would bring it back without a name. If
  // finishing takes that nameless box away, that is the whole undo.
  undo: () => {
    const before = get().map;
    get().stopEditing();
    if (get().map !== before) return;
    set((s) => {
      const step = history.undo(s.history, s.map);
      return step ? { ...forget(s, step.map), history: step.history, stepKey: null } : {};
    });
  },
  redo: () => {
    get().stopEditing();
    set((s) => {
      const step = history.redo(s.history, s.map);
      return step ? { ...forget(s, step.map), history: step.history, stepKey: null } : {};
    });
  },

  addBox: (at) => {
    const { map, nodeId } = addNode(get().map, at);
    set((s) => ({ ...commit(s, map, newBoxKey(nodeId)), editing: { kind: "box", id: nodeId } }));
    return nodeId;
  },
  renameBox: (id, name) => {
    if (!cleanName(name)) return;
    // Naming a box just added joins its "add" step (`newBoxKey`); any other
    // rename is a step of its own.
    set((s) => commit(s, renameNode(s.map, id, name), s.stepKey === newBoxKey(id) ? s.stepKey : null));
  },
  moveBox: (id, to, gesture) => set((s) => commit(s, moveNode(s.map, id, to), gesture ?? null)),
  nudgeBoxes: (positions) =>
    set((s) => {
      const next = moveNodes(s.map, positions);
      return next === s.map ? {} : { map: next, history: history.amendLast(s.history, s.map, next) };
    }),
  setBoxColor: (id, color) => set((s) => commit(s, setNodeColor(s.map, id, color))),
  deleteBox: (id) => set((s) => commit(s, deleteNode(s.map, id))),

  connect: (from, to) => {
    const added = addLink(get().map, from, to);
    if (added.linkId === null) return false;
    set((s) => commit(s, added.map));
    return true;
  },
  setConnecting: (connecting) => set({ connecting }),
  setLinkLabel: (id, label) => set((s) => commit(s, setLinkLabel(s.map, id, label))),
  deleteLink: (id) => set((s) => commit(s, deleteLink(s.map, id))),

  startEditing: (editing) => set({ editing }),
  stopEditing: () =>
    set((s) => {
      const e = s.editing;
      if (e?.kind === "box" && s.map.nodes[e.id]?.name === "") {
        // A box added and left without a name: its "add" step is taken
        // back and forgotten, as if it had never been added.
        const step = s.stepKey === newBoxKey(e.id) ? history.discardLast(s.history, s.map) : null;
        if (step) return { ...forget(s, step.map), history: step.history, stepKey: null, editing: null };
        return { ...commit(s, deleteNode(s.map, e.id)), editing: null };
      }
      // Typing is over: a later rename of this box is its own step.
      return { editing: null, stepKey: null };
    }),
}));
