import { create } from "zustand";

import { mapsToRestore } from "../domain/backup";
import { exampleMap, exampleTree } from "../domain/example";
import * as history from "../domain/history";
import { createMapId, createNodeId } from "../domain/ids";
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
import {
  canCollapse,
  canDeleteLink,
  canMove,
  canPaste,
  canSetStatus,
  moveRefusalText,
  nextStepRefusal,
} from "../domain/rules";
import { shownMap } from "../domain/shown";
import {
  emptyTrash,
  forgetTrashEntry,
  mapTrashOverflow,
  restoreFromTrash,
  summarize,
  trashBoxes,
  trashEntryId,
  trashOverflow,
  withTrashedMap,
  withoutTrashedMap,
  type MapTrash,
  type TrashSummary,
} from "../domain/trash";
import { addNextStep, branchesOf, createTree, moveToParent as moveUnder, startOf } from "../domain/tree";
import { UNTITLED_MAP } from "../domain/persistence";
import { copyName, removeMap, upsertMap, type Registry } from "../domain/registry";
import { ARROW_LENGTH_PRESETS, type LinkId, type LinkMap, type MapId, type NodeId, type NodeStatus, type PaletteColor, type Point, type Size } from "../domain/types";
import { mergeMaps, shareUnchanged } from "../domain/merge";
import {
  boardProblems,
  linkedProblem,
  linkTree,
  problemText,
  treeToBoard,
  unlinked,
  withStartName,
  type BoardErased,
} from "../domain/bridge";
import { useLinkHold } from "./linkHold";
import { boardExists, boardIdOfKey, hasBoardList, isBoardListKey, loadBoard } from "./persistBoard";
import { useMissingMaps } from "./missingMaps";
import { useSyncNotice } from "./syncNotice";
import {
  deleteStoredMap,
  loadActiveMapId,
  loadMap,
  loadMapTrash,
  loadRegistry,
  loadStarterId,
  saveActiveMapId,
  saveMap,
  saveMapTrash,
  saveStarterId,
  allowMapWrites,
  catchUpMap,
  forgetMapDeletedElsewhere,
  isListKey,
  linkStoredMap,
  mapIdOfKey,
  onMapMerged,
  takeUnplaced,
  unlistStoredMap,
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

/** A tree box being dragged over a place it could move to: another box (it
    would become that box's last next step) or a gap between siblings. */
export interface Dropping {
  readonly box: NodeId;
  /** The pointer, in page pixels: the chip follows it. */
  readonly at: Point;
  /** The box it would become a next step of. */
  readonly parent: NodeId;
  /** The sibling it would go just before; `null`: last. */
  readonly before: NodeId | null;
  /** Aiming at a gap: the bar drawn there. `null` when over a box. */
  readonly bar: { readonly from: Point; readonly to: Point } | null;
  /** Why letting go here would move nothing, in words; `null` if it may. */
  readonly refusal: string | null;
}

/** A delete waiting on the "trash is full" warning: what it would erase
    for good to make room, and the delete itself. `board`: a linked map's
    edit (a delete, or an undo or redo that takes boxes away) into its
    Boardkit board's full trash. */
export type TrashWarning =
  | { readonly kind: "boxes" | "map"; readonly erased: TrashSummary; readonly run: () => void }
  | {
      readonly kind: "board";
      readonly action: "delete" | "undo" | "redo";
      readonly erased: readonly BoardErased[];
      readonly run: () => void;
    };

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
  readonly dropping: Dropping | null;
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
  /** Deleted maps, oldest first, until restored or erased. */
  readonly trashedMaps: MapTrash;
  /** A delete that would push the oldest thing out of a full trash,
      waiting for the user's yes (Boardkit's warning). */
  readonly trashWarning: TrashWarning | null;

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
  /** Deletes a box and every arrow touching it, into the trash. In a tree, also every box
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
  /** Runs the delete the "trash is full" warning held back, erasing the
      oldest to make room. */
  confirmTrashWarning(): void;
  cancelTrashWarning(): void;
  /** Puts a deleted box (or branch, or group) back, as one undo step; the
      boxes put back end up selected. */
  restoreBoxes(entryId: NodeId): void;
  /** Erases one trash entry for good (undoable, as in Boardkit). */
  forgetBoxes(entryId: NodeId): void;
  /** Erases the open map's trash (undoable) and every deleted map (not). */
  emptyTrash(): void;
  /** Puts a deleted map back in the list (as the newest) and opens it. */
  restoreMap(id: MapId): void;
  /** Erases a deleted map for good. */
  eraseMap(id: MapId): void;
  /** Tree: adds a next step after `from` (at `at`, or just after it),
      opens its name for typing and re-tidies the tree. */
  addNextStep(from: NodeId, at?: Point): NodeId | null;

  /** Draws an arrow (`from` needs, or in a tree leads to, `to`) if the
      map's rules allow it. */
  connect(from: NodeId, to: NodeId): boolean;
  setConnecting(connecting: Connecting | null): void;
  setDropping(dropping: Dropping | null): void;
  /** Makes a tree box (with its branch) a next step of `parent`, just
      before `before` (`null`: last), opening `parent` if it is collapsed;
      the tree re-tidies. `gesture` joins the drag's own undo step, so the
      drag, the move and the tidy undo together. Refused, saying why, when
      the rules say no. */
  moveToParent(id: NodeId, parent: NodeId, before: NodeId | null, gesture?: string): void;
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
  /** Moves a map to the trash (asking first only when that would erase the
      oldest deleted map). The last map can't be deleted. */
  deleteMap(id: MapId): void;
  /**
   * Adds the maps from a backup that aren't here yet (matched by id: one
   * already here is never overwritten). An untouched starter example is
   * taken away, and the newest restored map opens.
   */
  restoreMaps(maps: readonly LinkMap[]): { readonly added: number; readonly alreadyHere: number };
  /**
   * "Link to Boardkit": the open tree becomes a new board in Boardkit, shared
   * from now on (see `linkPreview` for what the user is asked first). Its
   * own trash is emptied and its undo history cleared. Returns whether it
   * was linked; a tree that doesn't fit, or a failed write, changes nothing
   * (a failed write says so).
   */
  linkToBoard(): boolean;
  /** "Unlink from Boardkit": the open linked tree becomes an ordinary tree
      with its own copy; the board stays in Boardkit as an ordinary board.
      Its undo history is cleared. */
  unlinkFromBoard(): void;

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
function initialState(): Pick<MapState, "map" | "needsTidy" | "maps" | "starter" | "trashedMaps"> {
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
  return {
    map,
    // A linked tree with boxes made in Boardkit tidies them in first.
    needsTidy: saved === null || takeUnplaced(map.id),
    maps: upsertMap(maps, { id: map.id, name: map.name }),
    starter,
    trashedMaps: loadMapTrash(),
  };
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
function open(s: MapState, map: LinkMap, maps: Registry, needsTidy = takeUnplaced(map.id)): Partial<MapState> {
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
    dropping: null,
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
function commit(s: MapState, edited: LinkMap, key: string | null = null): Partial<MapState> {
  if (edited === s.map || refused(s, edited)) return {};
  // A linked tree's name is its start box's: renaming one renames both.
  const next = withStartName(edited);
  const join = key !== null && key === s.stepKey;
  return {
    ...forget(s, next),
    ...touchStarter(s),
    ...(next.name !== s.map.name ? { maps: upsertMap(s.maps, { id: next.id, name: next.name }) } : {}),
    history: join ? history.amendLast(s.history, s.map, next) : history.record(s.history, s.map, next),
    stepKey: key,
  };
}

/**
 * Whether a linked tree refuses an edit: every edit while its board can't
 * be written (`useLinkHold`, the banner says why), and one that breaks a
 * board's shape, saying why (a step under a card, a second way in).
 */
function refused(s: MapState, next: LinkMap): boolean {
  if (useLinkHold.getState().held[s.map.id]) return true;
  const problem = linkedProblem(next);
  if (problem) useSyncNotice.getState().say(`Not in a tree shared with Boardkit: ${problem}`);
  return problem !== null;
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

/**
 * Deletes boxes into the trash as one undo step, or, when that would push
 * the oldest deleted boxes out of a full trash, asks first (`trashWarning`).
 */
function trashing(s: MapState, ids: Iterable<NodeId>): Partial<MapState> {
  const gone = [...ids].filter((id) => s.map.nodes[id]);
  if (gone.length === 0) return {};
  const mapId = s.map.id;
  if (s.map.linkedBoard) {
    // A linked map has no trash of its own: saving puts the boxes in the
    // board's trash (`treeToBoard`), so it's that trash that may be full.
    const run = () =>
      useMapStore.setState((st) => (st.map.id === mapId ? commit(st, deleteNodes(st.map, gone)) : {}));
    const erased = boardErasing(s.map, deleteNodes(s.map, gone));
    return erased.length ? { trashWarning: { kind: "board", action: "delete", erased, run } } : commit(s, deleteNodes(s.map, gone));
  }
  const erased = summarize(trashOverflow(s.map, gone.length));
  if (!erased) return commit(s, trashBoxes(s.map, gone, Date.now()));
  const run = () =>
    useMapStore.setState((st) => (st.map.id === mapId ? commit(st, trashBoxes(st.map, gone, Date.now())) : {}));
  return { trashWarning: { kind: "boxes", erased, run } };
}

/**
 * What `next`, an edit of the linked map `map`, would erase for good from
 * its board's trash, oldest first: empty when the board's trash has room,
 * or the edit takes no box away (only then can it put one in the trash).
 * Read against the board as stored, which the save will write over.
 */
function boardErasing(map: LinkMap, next: LinkMap): readonly BoardErased[] {
  if (!next.linkedBoard || Object.keys(map.nodes).every((id) => next.nodes[id as NodeId])) return [];
  const stored = loadBoard(next.linkedBoard);
  if (stored.status !== "ok") return [];
  const result = treeToBoard(stored.record.board, next, Date.now());
  return result.ok ? result.erased : [];
}

/**
 * An undo or redo step taken, or, in a linked map whose board's trash it
 * would overfill (undoing an "add" puts the box in that trash), asked about
 * first. The asked-for step runs only if nothing changed meanwhile.
 */
function stepping(
  s: MapState,
  step: { readonly map: LinkMap; readonly history: MapState["history"] } | null,
  action: "undo" | "redo",
): Partial<MapState> {
  if (!step) return {};
  const apply = (st: MapState): Partial<MapState> => ({ ...forget(st, step.map), history: step.history, stepKey: null });
  const erased = boardErasing(s.map, step.map);
  if (erased.length === 0) return apply(s);
  const run = () => useMapStore.setState((st) => (st.map === s.map && st.history === s.history ? apply(st) : {}));
  return { trashWarning: { kind: "board", action, erased, run } };
}

/**
 * Moves a map to the trash: off the list, its stored record kept (saved
 * once more first, so its latest edits go with it). The open map is
 * replaced by the newest other one. An example never tidied was never
 * saved, and was never the user's: it just goes.
 */
function trashMap(id: MapId): void {
  const s = useMapStore.getState();
  if (s.maps.length <= 1 || !s.maps.some((m) => m.id === id)) return;
  const isOpen = id === s.map.id;
  if (isOpen) {
    s.stopEditing();
    // Its pending save must not list it again after it leaves the list.
    cancelSave();
  }
  const map = isOpen ? (useMapStore.getState().needsTidy ? null : useMapStore.getState().map) : loadMap(id, newPageSize());
  // Read fresh, not from the store: another tab may have changed it.
  let trashedMaps = loadMapTrash();
  if (map) {
    saveMap(map);
    const name = s.maps.find((m) => m.id === id)?.name ?? map.name;
    const added = withTrashedMap(trashedMaps, { id, name, boxes: Object.keys(map.nodes).length, deletedAt: Date.now() });
    for (const old of added.erased) deleteStoredMap(old.id);
    trashedMaps = added.trash;
    unlistStoredMap(id);
    saveMapTrash(trashedMaps);
  } else {
    deleteStoredMap(id);
  }
  const left = removeMap(s.maps, id);
  if (!isOpen) {
    const { [id]: _, ...histories } = s.histories;
    useMapStore.setState({ maps: left, histories, trashedMaps });
    return;
  }
  const { map: next, maps } = loadNewest(left);
  // `open` parks the outgoing history only for maps still listed, so the
  // deleted map's history is dropped here rather than kept around.
  if (next) useMapStore.setState((state) => ({ ...open(state, next, maps), trashedMaps }));
  else {
    const blank = blankMap();
    useMapStore.setState((state) => ({ ...open(state, blank, createStored(blank, maps)), trashedMaps }));
  }
}

const isLinkedMap = (map: LinkMap): map is LinkMap & { readonly linkedBoard: string } => !!map.linkedBoard;

/** What "Link to Boardkit" would do to a map, for the question before it. */
export type LinkPreview =
  /** Not offered: not a tree, already linked, or Boardkit's data isn't here
      (each address has its own storage; linking needs the shared site). */
  | { readonly kind: "unavailable" }
  /** The tree doesn't fit a board: each box in the way, in words. */
  | { readonly kind: "refused"; readonly problems: readonly string[] }
  | {
      readonly kind: "ok";
      readonly name: string;
      readonly lists: number;
      readonly cards: number;
      /** Boxes in the map's own trash, which linking erases. */
      readonly trashed: number;
    };

export function linkPreview(map: LinkMap): LinkPreview {
  if (map.kind !== "tree" || map.linkedBoard || !hasBoardList()) return { kind: "unavailable" };
  const problems = boardProblems(map);
  if (problems.length) return { kind: "refused", problems: problems.map((p) => problemText(map, p)) };
  const result = linkTree(map, () => false, createNodeId);
  if (!result.ok) return { kind: "refused", problems: result.problems.map((p) => problemText(map, p)) };
  return {
    kind: "ok",
    name: result.name,
    lists: result.board.listOrder.length,
    cards: Object.keys(result.board.cards).length,
    trashed: map.trash.reduce((n, entry) => n + entry.nodes.length, 0),
  };
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
  dropping: null,
  tidyRequest: { count: 0, direction: "TB", arrowLength: ARROW_LENGTH_PRESETS.medium, gesture: null },
  history: history.EMPTY_HISTORY,
  stepKey: null,
  histories: {},
  settleRequest: 0,
  confirmingDelete: null,
  editAfterTidy: null,
  trashWarning: null,

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
    if (useLinkHold.getState().held[get().map.id]) return;
    const before = get().map;
    get().stopEditing();
    if (get().map !== before) return;
    set((s) => stepping(s, history.undo(s.history, s.map), "undo"));
  },
  redo: () => {
    if (useLinkHold.getState().held[get().map.id]) return;
    get().stopEditing();
    set((s) => stepping(s, history.redo(s.history, s.map), "redo"));
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
      if (next === s.map) return {};
      // With no step to join (boxes from another app, tidied in), the room
      // made is not something to undo.
      if (s.history.past.length === 0) return { map: next };
      return { map: next, history: history.amendLast(s.history, s.map, next) };
    }),
  setBoxColor: (id, color) => set((s) => commit(s, setNodeColor(s.map, id, color))),
  deleteBox: (id) => get().deleteBoxes([id]),
  deleteBoxes: (ids) =>
    set((s) => {
      if (s.map.kind !== "tree") return trashing(s, ids);
      // A tree asks first when the delete takes boxes after these along.
      const branch = branchesOf(s.map, ids);
      const picked = ids.filter((id) => branch.has(id));
      if (picked.length === 0) return {};
      return branch.size > picked.length
        ? { confirmingDelete: { ids: picked, count: branch.size } }
        : trashing(s, branch);
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
      s.confirmingDelete ? { ...trashing(s, branchesOf(s.map, s.confirmingDelete.ids)), confirmingDelete: null } : {},
    ),
  cancelDelete: () => set({ confirmingDelete: null }),
  confirmTrashWarning: () => {
    const pending = get().trashWarning;
    set({ trashWarning: null });
    pending?.run();
  },
  cancelTrashWarning: () => set({ trashWarning: null }),
  restoreBoxes: (entryId) =>
    set((s) => {
      const next = restoreFromTrash(s.map, entryId);
      if (next === s.map) return {};
      const back = (s.map.trash.find((e) => trashEntryId(e) === entryId)?.nodes ?? []).map((n) => n.id);
      const shown = shownMap(next);
      return {
        ...commit(s, next),
        ...selecting(back.filter((id) => shown.nodes[id])),
        settleRequest: s.settleRequest + (next.kind === "tree" ? 1 : 0),
      };
    }),
  forgetBoxes: (entryId) => set((s) => commit(s, forgetTrashEntry(s.map, entryId))),
  emptyTrash: () => {
    for (const m of loadMapTrash()) deleteStoredMap(m.id);
    saveMapTrash([]);
    set((s) => ({ ...commit(s, emptyTrash(s.map)), trashedMaps: [] }));
  },
  restoreMap: (id) => {
    if (!get().trashedMaps.some((m) => m.id === id)) return;
    get().stopEditing();
    flushSave();
    const trashedMaps = withoutTrashedMap(loadMapTrash(), id);
    saveMapTrash(trashedMaps);
    const map = loadMap(id, newPageSize());
    if (!map) {
      // Unreadable (`loadMap` has copied it aside): nothing to put back.
      deleteStoredMap(id);
      set({ trashedMaps });
      return;
    }
    // Saved again, which lists it at the end, as the newest map.
    set((state) => ({ ...open(state, map, createStored(map, state.maps)), trashedMaps }));
  },
  eraseMap: (id) => {
    if (!get().trashedMaps.some((m) => m.id === id)) return;
    deleteStoredMap(id);
    const trashedMaps = withoutTrashedMap(loadMapTrash(), id);
    saveMapTrash(trashedMaps);
    set({ trashedMaps });
  },
  addNextStep: (from, at) => {
    get().stopEditing();
    const { map } = get();
    const parent = map.nodes[from];
    if (map.kind !== "tree" || !parent) return null;
    // The UI doesn't offer it then; this is the last word.
    const refusal = nextStepRefusal(map, from);
    if (refusal) {
      useSyncNotice.getState().say(refusal);
      return null;
    }
    const offset = NEXT_STEP_OFFSET[map.direction];
    // A collapsed box opens first, so the new step shows (one undo step).
    const open = setCollapsed(map, [from], false);
    const added = addNextStep(open, from, at ?? { x: parent.x + offset.x, y: parent.y + offset.y });
    if (!added) return null;
    // The last guard: a linked tree that was already out of a board's shape.
    const problem = linkedProblem(added.map);
    if (problem) {
      useSyncNotice.getState().say(`Not in a tree shared with Boardkit: ${problem}`);
      return null;
    }
    if (useLinkHold.getState().held[map.id]) return null;
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
  setDropping: (dropping) => set({ dropping }),
  moveToParent: (id, parent, before, gesture) =>
    set((s) => {
      const verdict = canMove(s.map, id, parent);
      if (!verdict.ok) {
        useSyncNotice.getState().say(moveRefusalText(s.map, id, parent, verdict.reason));
        return {};
      }
      // A collapsed box opens first, so the moved box shows (as for a new
      // next step).
      const next = moveUnder(setCollapsed(s.map, [parent], false), id, parent, before);
      if (next === s.map) return {};
      return { ...commit(s, next, gesture ?? null), settleRequest: s.settleRequest + 1 };
    }),
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
      // A linked tree's name is its start box's (the board's): an edit.
      const start = s.map.linkedBoard ? startOf(s.map) : null;
      if (start) return cleanName(name) ? commit(s, renameNode(s.map, start, name)) : {};
      const map = renameMap(s.map, name);
      return map === s.map ? {} : { map, maps: upsertMap(s.maps, { id: map.id, name: map.name }), ...touchStarter(s) };
    }),
  deleteMap: (id) => {
    const s = get();
    if (s.maps.length <= 1 || !s.maps.some((m) => m.id === id)) return;
    const erased = mapTrashOverflow(s.trashedMaps);
    if (!erased) return trashMap(id);
    const summary = { name: erased.name, boxes: erased.boxes, deletedAt: erased.deletedAt };
    set({ trashWarning: { kind: "map", erased: summary, run: () => trashMap(id) } });
  },
  restoreMaps: (incoming) => {
    get().stopEditing();
    flushSave();
    const s = get();
    // A deleted map counts as here: it is in the trash, to restore from there.
    const { add, alreadyHere } = mapsToRestore([...s.maps, ...s.trashedMaps], incoming);
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

  linkToBoard: () => {
    get().stopEditing();
    flushSave();
    const s = get();
    if (s.needsTidy) return false;
    const result = linkTree(s.map, boardExists, createNodeId);
    if (!result.ok) return false;
    if (!isLinkedMap(result.map) || !linkStoredMap(result.map, result.name, result.board)) {
      useSyncNotice.getState().say("Couldn't link to Boardkit: the browser's storage refused it. Nothing was changed.");
      return false;
    }
    const map = result.map;
    set({
      ...forget(s, map),
      ...touchStarter(s),
      maps: upsertMap(s.maps, { id: map.id, name: map.name }),
      history: history.EMPTY_HISTORY,
      stepKey: null,
      confirmingDelete: null,
    });
    return true;
  },
  unlinkFromBoard: () => {
    get().stopEditing();
    flushSave();
    const s = get();
    if (!s.map.linkedBoard) return;
    const map = unlinked(s.map);
    useLinkHold.getState().release(map.id);
    set({ ...forget(s, map), history: history.EMPTY_HISTORY, stepKey: null, confirmingDelete: null });
    // Stored at once, so a Boardkit tab's change from now on no longer
    // reaches this map.
    saveMap(map);
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

/*
 * Other tabs. Two tabs of Linkkit may have the same map open. Each saves
 * the whole map, so without this the last save would silently undo the
 * other's changes. Two halves (Boardkit's design):
 *
 *  - Every save checks the record's `rev` first and merges in what another
 *    tab stored since (`persistMap.ts`, `domain/merge.ts`); the merged map
 *    comes back here through `onMapMerged`.
 *  - The browser's `storage` event, which fires in every *other* tab of the
 *    same address when one tab writes, brings another tab's save in at
 *    once, merged with whatever this tab has not saved yet.
 *
 * Taking in another tab's change clears this map's undo history: an undo
 * step stores whole parts of the map as they were before, so undoing would
 * quietly put back what the other tab just changed. (Undo that steps
 * around the other tab's changes is a later step of the shared-store plan.)
 */

/** Puts `map` on screen as the open map, keeping every object that didn't
    change (`shareUnchanged`), so only what the other tab changed
    re-renders. */
function adoptMap(map: LinkMap): void {
  useMapStore.setState((s) => {
    const next = shareUnchanged(s.map, map);
    if (next === s.map) return {};
    // Boxes made in Boardkit come with no place: the tree tidies them in.
    const arrived = !!next.linkedBoard && Object.keys(next.nodes).some((id) => !s.map.nodes[id as NodeId]);
    return {
      ...forget(s, next),
      settleRequest: s.settleRequest + (arrived ? 1 : 0),
      maps: upsertMap(s.maps, { id: next.id, name: next.name }),
      history: history.EMPTY_HISTORY,
      stepKey: null,
      confirmingDelete: null,
    };
  });
}

/** The open map went away in another tab (trashed or erased): the newest
    map left opens, and the user is told. */
function leaveGoneMap(name: string, erased: boolean): void {
  const s = useMapStore.getState();
  // A trashed map keeps this tab's last edits (it can be restored); an
  // erased one is gone, and a save would bring it back.
  if (erased) cancelSave();
  else flushSave();
  const left = removeMap(s.maps, s.map.id);
  const { map: next, maps } = loadNewest(left);
  if (next) useMapStore.setState((state) => open(state, next, maps));
  else {
    const blank = blankMap();
    useMapStore.setState((state) => open(state, blank, createStored(blank, maps)));
  }
  useSyncNotice.getState().mapDeleted(name);
}

/** Another tab changed the map list or the deleted maps: both are read
    again. The open map stays listed while it is waiting for its first
    tidy (it isn't stored yet); if another tab deleted it, the newest map
    left opens. */
function pullLists(): void {
  const s = useMapStore.getState();
  const trashedMaps = loadMapTrash();
  let maps = loadRegistry();
  if (trashedMaps.some((m) => m.id === s.map.id)) {
    useMapStore.setState({ maps: upsertMap(maps, { id: s.map.id, name: s.map.name }), trashedMaps });
    leaveGoneMap(s.map.name, false);
    return;
  }
  if (!maps.some((m) => m.id === s.map.id)) maps = upsertMap(maps, { id: s.map.id, name: s.map.name });
  useMapStore.setState({ maps, trashedMaps });
}

/** Another tab stored (or erased) map `id`. Only the open map needs
    anything now; any other map is read fresh when it is opened. */
function pullMap(id: MapId, removed: boolean): void {
  // Stored again (another tab restored it from a file): writable again.
  if (!removed) allowMapWrites(id);
  const s = useMapStore.getState();
  if (id !== s.map.id || s.needsTidy) {
    if (removed) forgetMapDeletedElsewhere(id);
    return;
  }
  const result = catchUpMap(id, s.map);
  if (result.kind === "merged") adoptMap(result.map);
  else if (result.kind === "deleted") leaveGoneMap(s.map.name, true);
}

// A save that merged in another tab's save. Applied once the current store
// update is over: a save can happen inside one (switching maps flushes the
// outgoing map's save), and setting state from inside it would be lost.
onMapMerged((id, from, merged) =>
  queueMicrotask(() => {
    const s = useMapStore.getState();
    if (s.map.id !== id) return;
    // If this tab changed the map again since `from`, that change is kept
    // on top too.
    adoptMap(mergeMaps(from, s.map, merged).map);
  }),
);

/** Starts following other tabs' saves. Called once from `main.tsx`. */
export function initOtherTabs(): void {
  window.addEventListener("storage", (event) => {
    // `key` is null when another tab cleared all of storage: nothing to merge.
    if (event.key === null || event.storageArea !== localStorage) return;
    if (isListKey(event.key)) {
      pullLists();
      return;
    }
    const id = mapIdOfKey(event.key);
    if (id) {
      pullMap(id, event.newValue === null);
      return;
    }
    // Boardkit (on the shared site) saved the open linked tree's board, or
    // its list, which holds the board's name.
    const { map } = useMapStore.getState();
    if (map.linkedBoard && (isBoardListKey(event.key) || boardIdOfKey(event.key) === map.linkedBoard)) {
      pullMap(map.id, false);
    }
  });
}
