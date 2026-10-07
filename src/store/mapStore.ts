import { create } from "zustand";

import { mapsToRestore } from "../domain/backup";
import { exampleMap, exampleTree } from "../domain/example";
import * as history from "../domain/history";
import { createMapId } from "../domain/ids";
import {
  addLink,
  addNode,
  clampArrowLength,
  cleanName,
  createMap,
  deleteLink,
  copyFragment,
  deleteNode,
  deleteNodes,
  duplicateMap,
  fragmentCenter,
  moveNode,
  moveNodes,
  pasteFragment,
  renameMap,
  renameNode,
  setArrowLength,
  setLinkLabel,
  setDirection,
  setNodeColor,
  setNodesColor,
  setNodesStatus,
  setHideCut,
  setCollapsed,
  type MapFragment,
  setPage,
} from "../domain/map";
import { defaultPageSize } from "../domain/page";
import { canCollapse, canDeleteLink, canPaste, canSetStatus } from "../domain/rules";
import { shownMap } from "../domain/shown";
import { addNextStep, branchesOf, createTree, deleteBranches } from "../domain/tree";
import { UNTITLED_MAP } from "../domain/persistence";
import { copyName, removeMap, upsertMap, type Registry } from "../domain/registry";
import { ARROW_LENGTH_PRESETS, type LinkId, type LinkMap, type MapId, type NodeId, type NodeStatus, type PaletteColor, type Point, type Size } from "../domain/types";
import { useMissingMaps } from "./missingMaps";
import {
  deleteStoredMap,
  loadActiveMapId,
  loadMap,
  loadRegistry,
  loadStarterId,
  saveActiveMapId,
  saveMap,
  saveStarterId,
} from "./persistMap";
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
  /** The box whose needs / breaks are highlighted, or `null`. Always `null`
      while a group is picked (several highlights at once would be noise). */
  readonly selected: NodeId | null;
  /** Two or more boxes picked together (the marquee, Shift+click, Ctrl+A,
      a paste), or empty. A group of one is just `selected`. See
      `selectionOf`. */
  readonly group: readonly NodeId[];
  /** What Copy (or Cut) took, and how many times it has been pasted since,
      so each paste lands a step further along. Lasts the session and works
      across maps; never saved. */
  readonly clipboard: { readonly fragment: MapFragment; readonly pastes: number } | null;
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
  /** Bumped when a tree has grown (a next step, a second parent, a new
      step's name typed, an arrow label typed or changed):
      the canvas re-tidies the tree once every box is
      measured, and the boxes glide to make room. That tidy joins the latest
      undo step, so adding a step and making room for it undo together. */
  readonly settleRequest: number;
  /** Tree boxes whose delete takes other boxes with them, waiting for the
      user to confirm (`count` boxes in all). */
  readonly confirmingDelete: { readonly ids: readonly NodeId[]; readonly count: number } | null;
  /** A box whose name opens for typing once the first tidy has shown the
      map (a new tree's start: a hidden field could not take focus). */
  readonly editAfterTidy: NodeId | null;
  /** Every saved map (ids and names, oldest first): the switcher's list. */
  readonly maps: Registry;
  /** The example a first-ever visit opened, until it is first changed
      (see `loadStarterId`). Alone in the list, it means Linkkit is empty. */
  readonly starter: MapId | null;
  /** The undo histories of the other maps opened this session, parked
      while another map is open. */
  readonly histories: Readonly<Record<MapId, history.History>>;

  /** Puts every box where Tidy up (or Align) said, and records the page
      size and settings Tidy up used, in one change. Changes with the same
      `gesture` are one undo step. */
  placeAll(positions: ReadonlyMap<NodeId, Point>, page?: Size, settings?: TidySettings, gesture?: string | null): void;
  /** Selects a box (`null` clears the selection), ending any group. */
  select(id: NodeId | null): void;
  /** Selects several boxes (one is a plain `select`, none clears). */
  selectGroup(ids: readonly NodeId[]): void;
  /** Shift+click: adds a box to the selection, or takes it out. */
  toggleSelected(id: NodeId): void;
  selectAll(): void;
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
  /** Deletes a box and every arrow touching it. In a tree, also every box
      only reachable through it (asking first, through `confirmingDelete`,
      when that is more than the box itself); the start is never deleted. */
  deleteBox(id: NodeId): void;
  /** Several boxes at once, as one undo step (a tree asks first in the
      same way when more than these would go). */
  deleteBoxes(ids: readonly NodeId[]): void;
  /** Moves several boxes; moves with the same `gesture` are one step. */
  moveBoxes(positions: ReadonlyMap<NodeId, Point>, gesture?: string): void;
  setBoxesColor(ids: readonly NodeId[], color: PaletteColor | null): void;
  /** Keep / maybe / cut (`null` clears it) on every box that may have one
      (`canSetStatus`), as one undo step. */
  setBoxesStatus(ids: readonly NodeId[], status: NodeStatus | null): void;
  /** The X key: cuts the boxes, or uncuts them when all are cut already. */
  toggleCut(ids: readonly NodeId[]): void;
  /** Takes boxes that look cut off the page (and out of Tidy up), or
      brings them back. Undoable; the tree re-tidies around what shows. */
  setHideCut(hideCut: boolean): void;
  /** Folds the boxes' branches away, or opens them when all are folded
      (Treekit's collapse). Undoable; the tree re-tidies around what shows. */
  toggleCollapsed(ids: readonly NodeId[]): void;
  /** Copies boxes and the arrows between them to the clipboard. Only where
      the rules allow pasting (`canPaste`): not in a tree. */
  copyBoxes(ids: readonly NodeId[]): void;
  /** Copies, then deletes. */
  cutBoxes(ids: readonly NodeId[]): void;
  /** Pastes the clipboard: centred on `at`, or a step down-right of where
      it was copied from (further with each paste). The pasted boxes end up
      selected, ready to drag. */
  paste(at?: Point): void;
  /** Copies boxes straight in again, a step down-right, without touching
      the clipboard; the copies end up selected. */
  duplicateBoxes(ids: readonly NodeId[]): void;
  confirmDelete(): void;
  cancelDelete(): void;
  /** Tree: adds a next step after `from` (at `at`, or just after it),
      opens its name for typing and re-tidies the tree. */
  addNextStep(from: NodeId, at?: Point): NodeId | null;

  /** Draws an arrow (`from` needs, or in a tree leads to, `to`) if the
      map's rules allow it. */
  connect(from: NodeId, to: NodeId): boolean;
  setConnecting(connecting: Connecting | null): void;
  /** An emptied label goes back to the kind's default. */
  setLinkLabel(id: LinkId, label: string): void;
  /** Only where the rules allow it (never a tree box's only way in). */
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
  /** Starts a blank tree (only its start box, its name open for typing). */
  newTree(): void;
  /** Adds a fresh example tree and opens it, tidied. */
  addExampleTree(): void;
  switchMap(id: MapId): void;
  /** Renames the open map. Not an undo step: undo is about the map's
      content, and the name is right there to click and change back. An
      empty name is ignored. */
  renameMap(name: string): void;
  /** Deletes a map for good. The last map can't be deleted. */
  deleteMap(id: MapId): void;
  /**
   * Adds the maps from a backup that aren't here yet (matched by id: one
   * already here is never overwritten). An untouched starter example is
   * taken away, and the newest restored map opens.
   */
  restoreMaps(maps: readonly LinkMap[]): { readonly added: number; readonly alreadyHere: number };

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

export function newPageSize(): Size {
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

/**
 * Every map, oldest first, for "Export all maps": the open one as it is on
 * screen (its pending save is written first), the others as saved. An
 * example still waiting for its first tidy is left out (its boxes are all
 * on one spot), and so is a map that can no longer be read.
 */
export function mapsForExport(): LinkMap[] {
  flushSave();
  const s = useMapStore.getState();
  const maps: LinkMap[] = [];
  for (const { id } of s.maps) {
    const map = id === s.map.id ? (s.needsTidy ? null : s.map) : loadMap(id, newPageSize());
    if (map) maps.push(map);
  }
  return maps;
}

/** The map that was open last (else the newest saved one), or the example
    if there is none. */
function initialState(): Pick<MapState, "map" | "needsTidy" | "maps" | "starter"> {
  // Maps the list names but storage lost are reported, not just dropped.
  const registry = loadRegistry((missing) => useMissingMaps.getState().setMissing(missing.map((m) => m.name)));
  const id = loadActiveMapId();
  const active = id !== null && registry.some((m) => m.id === id) ? loadMap(id, newPageSize()) : null;
  const { map: saved, maps } = active ? { map: active, maps: registry } : loadNewest(registry);
  const map = saved ?? exampleMap(newPageSize());
  // Nothing saved: this example is the starter, and Linkkit is empty.
  const remembered = loadStarterId();
  const starter = saved === null ? map.id : remembered !== null && maps.some((m) => m.id === remembered) ? remembered : null;
  if (starter !== remembered) saveStarterId(starter);
  return { map, needsTidy: saved === null, maps: upsertMap(maps, { id: map.id, name: map.name }), starter };
}

/** Any change to the starter example makes it the user's own map. */
function touchStarter(s: MapState): Partial<MapState> {
  if (s.starter === null || s.starter !== s.map.id) return {};
  saveStarterId(null);
  return { starter: null };
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
    group: [],
    editing: null,
    connecting: null,
    confirmingDelete: null,
    editAfterTidy: null,
  };
}

/** Saves a new map right away, so it is listed even before its first edit. */
function createStored(map: LinkMap, maps: Registry): Registry {
  saveMap(map);
  return upsertMap(maps, { id: map.id, name: map.name });
}

const blankMap = (): LinkMap => createMap(createMapId(), UNTITLED_MAP, newPageSize());

const UNTITLED_TREE = "Untitled tree";

/** The selection as `selected` and `group`: two or more boxes are a
    group, one is just selected. */
function selecting(ids: readonly NodeId[]): Pick<MapState, "selected" | "group"> {
  return ids.length > 1 ? { selected: null, group: ids } : { selected: ids[0] ?? null, group: [] };
}

/** Every selected box: the group, else the one selected box, else none. */
export function selectionOf(s: Pick<MapState, "selected" | "group">): readonly NodeId[] {
  return s.group.length > 0 ? s.group : s.selected ? [s.selected] : [];
}

/** Drops view state that points at something no longer on the map, or
    no longer shown on it (a cut box with "hide cut" on). */
function forget(s: MapState, map: LinkMap): Pick<MapState, "map" | "selected" | "group" | "editing"> {
  const shown = shownMap(map);
  const gone = (e: Editing | null) => e !== null && !(e.kind === "box" ? shown.nodes[e.id] : shown.links[e.id]);
  const kept = selectionOf(s).filter((id) => shown.nodes[id]);
  // A group that lost boxes stays a group only while two are left.
  const selection = kept.length === selectionOf(s).length ? { selected: s.selected, group: s.group } : selecting(kept);
  return { map, ...selection, editing: gone(s.editing) ? null : s.editing };
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
    ...touchStarter(s),
    history: join ? history.amendLast(s.history, s.map, next) : history.record(s.history, s.map, next),
    stepKey: key,
  };
}

/**
 * `commit`, plus a re-tidy when boxes came onto or left the page ("hide
 * cut" turned on or off, a box cut or uncut while it is on, a branch
 * collapsed or expanded): the tree
 * closes the gap or makes room, in the same undo step (see settleRequest).
 */
function withRoomMade(s: MapState, next: LinkMap): Partial<MapState> {
  const before = Object.keys(shownMap(s.map).nodes).length;
  const after = Object.keys(shownMap(next).nodes).length;
  return { ...commit(s, next), settleRequest: s.settleRequest + (before !== after ? 1 : 0) };
}

/** The undo step a new box and its first name share. */
const newBoxKey = (id: NodeId) => `new:${id}`;

/** How far down-right each paste or duplicate lands from the boxes it
    copies, so a copy never hides exactly behind them. */
const PASTE_STEP = 24;

/** Pastes a fragment as one undo step, the copies selected. */
function pasteInto(s: MapState, fragment: MapFragment, offset: Point): Partial<MapState> {
  if (!canPaste(s.map) || fragment.nodes.length === 0) return {};
  const pasted = pasteFragment(s.map, fragment, offset);
  return { ...commit(s, pasted.map), ...selecting(pasted.nodeIds), editing: null };
}

/** Where a new step goes before the tree re-tidies (it glides from here):
    just after its parent, in the tree's direction. */
const NEXT_STEP_OFFSET = { TB: { x: 0, y: 96 }, LR: { x: 200, y: 0 } };

export const useMapStore = create<MapState>()((set, get) => ({
  ...initialState(),
  selected: null,
  group: [],
  clipboard: null,
  editing: null,
  connecting: null,
  tidyRequest: { count: 0, direction: "TB", arrowLength: ARROW_LENGTH_PRESETS.medium, gesture: null },
  history: history.EMPTY_HISTORY,
  stepKey: null,
  histories: {},
  settleRequest: 0,
  confirmingDelete: null,
  editAfterTidy: null,

  // The example's first tidy places boxes that were never shown anywhere
  // else: not something to undo back to.
  placeAll: (positions, page, settings, gesture = null) =>
    set((s) => {
      let next = moveNodes(s.map, positions);
      if (page) next = setPage(next, page);
      if (settings) next = setArrowLength(setDirection(next, settings.direction), settings.arrowLength);
      if (s.needsTidy) {
        const edit = s.editAfterTidy && next.nodes[s.editAfterTidy] ? s.editAfterTidy : null;
        return { map: next, needsTidy: false, editAfterTidy: null, editing: edit ? { kind: "box", id: edit } : s.editing };
      }
      return commit(s, next, gesture && `arrows:${gesture}`);
    }),
  select: (id) => set({ selected: id, group: [] }),
  selectGroup: (ids) => set((s) => selecting(ids.filter((id) => s.map.nodes[id]))),
  toggleSelected: (id) =>
    set((s) => {
      const now = selectionOf(s);
      return selecting(now.includes(id) ? now.filter((n) => n !== id) : [...now, id]);
    }),
  selectAll: () => set((s) => selecting(Object.keys(shownMap(s.map).nodes) as NodeId[])),
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
  deleteBox: (id) => get().deleteBoxes([id]),
  deleteBoxes: (ids) =>
    set((s) => {
      if (s.map.kind !== "tree") return commit(s, deleteNodes(s.map, ids));
      // A tree asks first when the delete takes boxes after these along.
      const branch = branchesOf(s.map, ids);
      const picked = ids.filter((id) => branch.has(id));
      if (picked.length === 0) return {};
      return branch.size > picked.length
        ? { confirmingDelete: { ids: picked, count: branch.size } }
        : commit(s, deleteBranches(s.map, picked));
    }),
  moveBoxes: (positions, gesture) => set((s) => commit(s, moveNodes(s.map, positions), gesture ?? null)),
  setBoxesColor: (ids, color) => set((s) => commit(s, setNodesColor(s.map, ids, color))),
  setBoxesStatus: (ids, status) => set((s) => withRoomMade(s, setNodesStatus(s.map, ids, status))),
  toggleCut: (ids) =>
    set((s) => {
      const settable = ids.filter((id) => canSetStatus(s.map, id));
      if (settable.length === 0) return {};
      // All cut already: uncut them. Otherwise: cut them all.
      const allCut = settable.every((id) => s.map.nodes[id].status === "cut");
      return withRoomMade(s, setNodesStatus(s.map, settable, allCut ? null : "cut"));
    }),
  setHideCut: (hideCut) => set((s) => withRoomMade(s, setHideCut(s.map, hideCut))),
  toggleCollapsed: (ids) =>
    set((s) => {
      const foldable = ids.filter((id) => canCollapse(s.map, id));
      if (foldable.length === 0) return {};
      // All collapsed already: expand them. Otherwise: collapse them all.
      const all = foldable.every((id) => s.map.collapsed.includes(id));
      return withRoomMade(s, setCollapsed(s.map, foldable, !all));
    }),
  copyBoxes: (ids) =>
    set((s) => {
      const fragment = copyFragment(s.map, ids);
      return canPaste(s.map) && fragment.nodes.length > 0 ? { clipboard: { fragment, pastes: 0 } } : {};
    }),
  cutBoxes: (ids) => {
    if (!canPaste(get().map)) return;
    get().copyBoxes(ids);
    get().deleteBoxes(ids);
  },
  paste: (at) =>
    set((s) => {
      if (!s.clipboard || !canPaste(s.map)) return {};
      const { fragment, pastes } = s.clipboard;
      const center = fragmentCenter(fragment);
      const step = PASTE_STEP * (pastes + 1);
      const offset = at ? { x: at.x - center.x, y: at.y - center.y } : { x: step, y: step };
      return { ...pasteInto(s, fragment, offset), clipboard: { fragment, pastes: pastes + 1 } };
    }),
  duplicateBoxes: (ids) => set((s) => pasteInto(s, copyFragment(s.map, ids), { x: PASTE_STEP, y: PASTE_STEP })),
  confirmDelete: () =>
    set((s) =>
      s.confirmingDelete ? { ...commit(s, deleteBranches(s.map, s.confirmingDelete.ids)), confirmingDelete: null } : {},
    ),
  cancelDelete: () => set({ confirmingDelete: null }),
  addNextStep: (from, at) => {
    get().stopEditing();
    const { map } = get();
    const parent = map.nodes[from];
    if (map.kind !== "tree" || !parent) return null;
    const offset = NEXT_STEP_OFFSET[map.direction];
    // A collapsed box opens first, so the new step shows (one undo step).
    const open = setCollapsed(map, [from], false);
    const added = addNextStep(open, from, at ?? { x: parent.x + offset.x, y: parent.y + offset.y });
    if (!added) return null;
    set((s) => ({
      ...commit(s, added.map, newBoxKey(added.nodeId)),
      editing: { kind: "box", id: added.nodeId },
      settleRequest: s.settleRequest + 1,
    }));
    return added.nodeId;
  },

  connect: (from, to) => {
    const added = addLink(get().map, from, to);
    if (added.linkId === null) return false;
    set((s) => ({ ...commit(s, added.map), settleRequest: s.settleRequest + (s.map.kind === "tree" ? 1 : 0) }));
    return true;
  },
  setConnecting: (connecting) => set({ connecting }),
  // A tree makes room for a new or changed label at once (the label and
  // the room are one undo step, see settleRequest), so it never covers a box.
  setLinkLabel: (id, label) =>
    set((s) => {
      const next = setLinkLabel(s.map, id, label);
      const settle = next !== s.map && next.kind === "tree" ? 1 : 0;
      return { ...commit(s, next), settleRequest: s.settleRequest + settle };
    }),
  deleteLink: (id) => set((s) => (canDeleteLink(s.map, id) ? commit(s, deleteLink(s.map, id)) : {})),

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
  newTree: () => {
    get().stopEditing();
    flushSave();
    const { map, startId } = createTree(createMapId(), UNTITLED_TREE, newPageSize());
    // Saved at once, like a new map; the first tidy centres the start box,
    // then its name opens for typing (select-all, so typing replaces
    // "Start", and leaving it empty keeps "Start").
    set((s) => ({ ...open(s, map, createStored(map, s.maps), true), editAfterTidy: startId }));
  },
  addExampleTree: () => {
    get().stopEditing();
    flushSave();
    const map = exampleTree(newPageSize());
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
      return map === s.map ? {} : { map, maps: upsertMap(s.maps, { id: map.id, name: map.name }), ...touchStarter(s) };
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
  restoreMaps: (incoming) => {
    get().stopEditing();
    flushSave();
    const s = get();
    const { add, alreadyHere } = mapsToRestore(s.maps, incoming);
    if (add.length === 0) return { added: 0, alreadyHere };
    let maps = s.maps;
    for (const map of add) maps = createStored(map, maps);
    // The untouched example goes: it was never the user's. If it is open,
    // its pending save (or first tidy) must not bring it back.
    const starter = s.starter !== null && maps.some((m) => m.id === s.starter) ? s.starter : null;
    if (starter !== null) {
      if (starter === s.map.id) cancelSave();
      deleteStoredMap(starter);
      maps = removeMap(maps, starter);
      saveStarterId(null);
    }
    const newest = add[add.length - 1];
    set((state) => ({ ...open(state, newest, maps), starter: null }));
    return { added: add.length, alreadyHere };
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
      // A new tree step just named: its final size is known now, so the
      // tree makes room for it (joined to the same step, see settleRequest).
      const named = e?.kind === "box" && s.map.kind === "tree" && s.stepKey === newBoxKey(e.id);
      // Typing is over: a later rename of this box is its own step.
      return { editing: null, stepKey: null, settleRequest: s.settleRequest + (named ? 1 : 0) };
    }),
}));
