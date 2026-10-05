import { create } from "zustand";

import { exampleMap } from "../domain/example";
import * as history from "../domain/history";
import { createMapId } from "../domain/ids";
import {
  addLink,
  addNode,
  clampArrowLength,
  cleanName,
  createMap,
  deleteLink,
  deleteNode,
  duplicateMap,
  moveNode,
  moveNodes,
  renameMap,
  renameNode,
  setArrowLength,
  setLinkLabel,
  setDirection,
  setNodeColor,
  setPage,
} from "../domain/map";
import { defaultPageSize } from "../domain/page";
import { UNTITLED_MAP } from "../domain/persistence";
import { copyName, removeMap, upsertMap, type Registry } from "../domain/registry";
import { ARROW_LENGTH_PRESETS, type LinkId, type LinkMap, type MapId, type NodeId, type PaletteColor, type Point, type Size } from "../domain/types";
import { deleteStoredMap, loadActiveMapId, loadMap, loadRegistry, saveActiveMapId, saveMap } from "./persistMap";
import { cancelSave, flushSave } from "./saveQueue";

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

/** The map's settings Tidy up follows: which way, and how long the arrows. */
export type TidySettings = Pick<LinkMap, "direction" | "arrowLength">;

/** A press of "Tidy up" (or of the Top-down / Left-right switch or an
    arrow length, which tidy with the new setting). */
export interface TidyRequest extends TidySettings {
  /** Counts presses: the canvas tidies when it changes. */
  readonly count: number;
  /** Set while the arrow length is being dragged or scrolled: every tidy
      of one gesture joins one undo step, and the boxes follow at once
      instead of gliding (a glide would lag behind the hand). */
  readonly gesture: string | null;
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
 * reload starts without them. So is the undo history: it lasts the session,
 * one history per map (switching away and back keeps it, as in Treekit).
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
  readonly tidyRequest: TidyRequest;
  readonly history: history.History;
  /** Which edit the latest undo step belongs to (a drag, a new box being
      named), so the next edit with the same key joins that step instead of
      making its own. `null`: the next edit is a step of its own. */
  readonly stepKey: string | null;
  /** Every saved map (ids and names, oldest first): the switcher's list. */
  readonly maps: Registry;
  /** The undo histories of the other maps opened this session, parked
      while another map is open. */
  readonly histories: Readonly<Record<MapId, history.History>>;

  /** Puts every box where Tidy up (or Align) said, and records the page
      size and settings Tidy up used, in one change. Changes with the same
      `gesture` are one undo step. */
  placeAll(positions: ReadonlyMap<NodeId, Point>, page?: Size, settings?: TidySettings, gesture?: string | null): void;
  /** Selects a box (`null` clears the selection). */
  select(id: NodeId | null): void;
  /** Asks the canvas to tidy the map up (see `tidyRequest`), in the
      map's own settings unless others are given: switching direction or
      arrow length is a tidy with the new one, saved as one change with it.
      `gesture`: see `TidyRequest`. */
  requestTidy(change?: Partial<TidySettings>, gesture?: string): void;
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

  /* Several maps. Each one finishes typing and writes the pending save
     first, so the outgoing map's last edits are kept before anything else
     happens. */
  /** Starts a blank map and opens it. */
  newMap(): void;
  /** Copies the open map ("Name (copy)") and opens the copy. */
  duplicateMap(): void;
  /** Adds a fresh example map (never replaces one) and opens it, tidied. */
  addExampleMap(): void;
  switchMap(id: MapId): void;
  /** Renames the open map. Not an undo step: undo is about the map's
      content, and the name is right there to click and change back. An
      empty name is ignored. */
  renameMap(name: string): void;
  /** Deletes a map for good. The last map can't be deleted. */
  deleteMap(id: MapId): void;

  startEditing(editing: Editing): void;
  /** Ends typing. A box still without a name is removed (as in the
      prototype: a box added by mistake goes away on Escape). */
  stopEditing(): void;
}

/**
 * A new map's recorded page size (see `LinkMap.page`) until its first Tidy
 * up: about the window's size (the prototype's numbers). The canvas draws
 * the page from the screen, not from this.
 */
const NEW_PAGE = { minWidth: 360, maxWidth: 980, viewportGutter: 48, height: 560 };

function newPageSize(): Size {
  return defaultPageSize(typeof window === "undefined" ? NEW_PAGE.maxWidth : window.innerWidth, NEW_PAGE);
}

/** Loads the newest map in `maps` that can be read. One that can't leaves
    the list (`loadMap` has already copied it aside). */
function loadNewest(maps: Registry): { map: LinkMap | null; maps: Registry } {
  let left = maps;
  while (left.length > 0) {
    const id = left[left.length - 1].id;
    const map = loadMap(id, newPageSize());
    if (map) return { map, maps: left };
    deleteStoredMap(id);
    left = removeMap(left, id);
  }
  return { map: null, maps: left };
}

/** The map that was open last (else the newest saved one), or the example
    if there is none. */
function initialState(): Pick<MapState, "map" | "needsTidy" | "maps"> {
  const registry = loadRegistry();
  const id = loadActiveMapId();
  const active = id !== null && registry.some((m) => m.id === id) ? loadMap(id, newPageSize()) : null;
  const { map: saved, maps } = active ? { map: active, maps: registry } : loadNewest(registry);
  const map = saved ?? exampleMap(newPageSize());
  return { map, needsTidy: saved === null, maps: upsertMap(maps, { id: map.id, name: map.name }) };
}

/**
 * The store fields that change when a different map goes on screen. The
 * outgoing map's undo history is parked in `histories` (unless that map
 * was just deleted), and the incoming one's picked back up. Selection,
 * typing and a half-drawn arrow never carry across maps.
 */
function open(s: MapState, map: LinkMap, maps: Registry, needsTidy = false): Partial<MapState> {
  // An example still waiting for its first tidy becomes "the map open
  // last" only once it is tidied and saved: see autoSave.ts.
  if (!needsTidy) saveActiveMapId(map.id);
  const { [map.id]: incoming, ...others } = s.histories;
  return {
    map,
    maps,
    needsTidy,
    history: incoming ?? history.EMPTY_HISTORY,
    histories: maps.some((m) => m.id === s.map.id) ? { ...others, [s.map.id]: s.history } : others,
    stepKey: null,
    selected: null,
    editing: null,
    connecting: null,
  };
}

/** Saves a new map right away, so it is listed even before its first edit. */
function createStored(map: LinkMap, maps: Registry): Registry {
  saveMap(map);
  return upsertMap(maps, { id: map.id, name: map.name });
}

const blankMap = (): LinkMap => createMap(createMapId(), UNTITLED_MAP, newPageSize());

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
  tidyRequest: { count: 0, direction: "TB", arrowLength: ARROW_LENGTH_PRESETS.medium, gesture: null },
  history: history.EMPTY_HISTORY,
  stepKey: null,
  histories: {},

  // The example's first tidy places boxes that were never shown anywhere
  // else: not something to undo back to.
  placeAll: (positions, page, settings, gesture = null) =>
    set((s) => {
      let next = moveNodes(s.map, positions);
      if (page) next = setPage(next, page);
      if (settings) next = setArrowLength(setDirection(next, settings.direction), settings.arrowLength);
      return s.needsTidy ? { map: next, needsTidy: false } : commit(s, next, gesture && `arrows:${gesture}`);
    }),
  select: (id) => set({ selected: id }),
  requestTidy: (change, gesture) =>
    set((s) => ({
      tidyRequest: {
        count: s.tidyRequest.count + 1,
        direction: change?.direction ?? s.map.direction,
        arrowLength: clampArrowLength(change?.arrowLength ?? s.map.arrowLength),
        gesture: gesture ?? null,
      },
    })),

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
    // Normally the old field's blur has already done this; if it never got
    // focus, a nameless box would otherwise be left behind.
    get().stopEditing();
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

  newMap: () => {
    get().stopEditing();
    flushSave();
    const map = blankMap();
    set((s) => open(s, map, createStored(map, s.maps)));
  },
  duplicateMap: () => {
    get().stopEditing();
    flushSave();
    const s = get();
    const map = duplicateMap(s.map, createMapId(), copyName(s.map.name, s.maps));
    set(open(s, map, createStored(map, s.maps)));
  },
  addExampleMap: () => {
    get().stopEditing();
    flushSave();
    const map = exampleMap(newPageSize());
    set((s) => open(s, map, upsertMap(s.maps, { id: map.id, name: map.name }), true));
  },
  switchMap: (id) => {
    if (id === get().map.id) return;
    get().stopEditing();
    flushSave();
    const map = loadMap(id, newPageSize());
    if (!map) {
      // Missing, or unreadable -- in which case `loadMap` has already copied
      // it aside. Either way there is nothing to open, so it leaves the list
      // rather than stay there as a dead entry.
      deleteStoredMap(id);
      set((s) => ({ maps: removeMap(s.maps, id) }));
      return;
    }
    set((s) => open(s, map, s.maps));
  },
  renameMap: (name) =>
    set((s) => {
      const map = renameMap(s.map, name);
      return map === s.map ? {} : { map, maps: upsertMap(s.maps, { id: map.id, name: map.name }) };
    }),
  deleteMap: (id) => {
    const s = get();
    if (s.maps.length <= 1 || !s.maps.some((m) => m.id === id)) return;
    if (id !== s.map.id) {
      deleteStoredMap(id);
      const { [id]: _, ...histories } = s.histories;
      set({ maps: removeMap(s.maps, id), histories });
      return;
    }
    // The open map: its pending save must not bring it back.
    get().stopEditing();
    cancelSave();
    deleteStoredMap(id);
    const { map: next, maps } = loadNewest(removeMap(s.maps, id));
    // `open` parks the outgoing history only for maps still listed, so the
    // deleted map's history is dropped here rather than kept around.
    if (next) set((state) => open(state, next, maps));
    else {
      const blank = blankMap();
      set((state) => open(state, blank, createStored(blank, maps)));
    }
  },

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
