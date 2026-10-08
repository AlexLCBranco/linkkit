import { BOARD_RECORD_VERSION, nextRecord, type BoardContent, type BoardRecord } from "../domain/boardRecord";
import { linkedTree, problemText, treeToBoard, unlinked, withStartName } from "../domain/bridge";
import { mergeMaps, sameMap } from "../domain/merge";
import { readMap, revOf, serializeMap, serializeStored, type MapRead } from "../domain/persistence";
import { readRegistry, removeMap, serializeRegistry, upsertMap, type Registry } from "../domain/registry";
import { readMapTrash, serializeMapTrash, type MapTrash } from "../domain/trash";
import type { LinkMap, MapId, NodeId, Size } from "../domain/types";
import { useLinkHold, type HoldReason } from "./linkHold";
import { boardKey, createBoard, loadBoard, loadBoardName, removeBoard, writeBoard, writeBoardName } from "./persistBoard";
import { useSaveHealth } from "./saveHealth";
import { useSyncNotice } from "./syncNotice";

/**
 * The only module that touches localStorage for maps. `domain/` owns the
 * saved shapes and their validation; this owns where they live:
 *
 *   linkkit:map:<id>   one map
 *   linkkit:registry   the list of maps (ids and names, creation order)
 *   linkkit:active     the id of the map that was open last
 *   linkkit:starter    the example a first-ever visit opened, while it is
 *                      still untouched (see `loadStarterId`)
 *   linkkit:damaged:…  a damaged map's original text, kept aside
 *   linkkit:trash:maps the deleted maps (their own keys stay until erased)
 *
 * (`linkkit:align` and `linkkit:zoom` belong to `viewStore.ts`.) Every key starts with
 * "linkkit:" because the shared gauntlet site gives Linkkit and Boardkit
 * one localStorage between them.
 *
 * Every write is wrapped: storage can fail (quota, private browsing)
 * without that being fatal -- the app keeps working in memory. A failure
 * is never silent, though: each write is reported to `saveHealth.ts`, and
 * a banner stays up until that key saves again.
 */
const MAP_KEY_PREFIX = "linkkit:map:";
const REGISTRY_KEY = "linkkit:registry";
const ACTIVE_KEY = "linkkit:active";
const DAMAGED_KEY_PREFIX = "linkkit:damaged:";
const STARTER_KEY = "linkkit:starter";
const MAP_TRASH_KEY = "linkkit:trash:maps";

/** What the list shows for a stored map that cannot be read at all. */
const DAMAGED_MAP_NAME = "Damaged map";

/** Writes one key; true if it was stored. `track` false keeps a one-off
    write (a damaged map's original, set aside) out of the banner: it is
    never retried, so it would hold the banner up for good. */
function tryWrite(key: string, value: string, track = true): boolean {
  let ok = true;
  try {
    localStorage.setItem(key, value);
  } catch {
    // See the module comment: failing to save is not fatal.
    ok = false;
  }
  if (track) useSaveHealth.getState().report(key, ok, () => tryWrite(key, value));
  return ok;
}

function parse(raw: string, fallbackPage: Size): MapRead {
  try {
    return readMap(JSON.parse(raw), fallbackPage);
  } catch {
    return { status: "unreadable" };
  }
}

function storedMapIds(): MapId[] {
  const ids: MapId[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(MAP_KEY_PREFIX)) ids.push(key.slice(MAP_KEY_PREFIX.length) as MapId);
  }
  return ids;
}

function writeRegistry(registry: Registry): void {
  tryWrite(REGISTRY_KEY, JSON.stringify(serializeRegistry(registry)));
}

/**
 * The list of saved maps, reconciled with what is actually stored: an entry
 * whose map is gone is dropped, and a stored map the list does not know is
 * added. That also covers the map saved before the list existed (v0.0.6
 * and earlier), and a list lost or damaged on its own.
 *
 * A dropped entry means a map's content is gone -- most likely its save
 * failed (storage full) and the tab closed before it was retried. Opening
 * Linkkit passes `onMissing` to hear which ones, so it can say so instead of
 * the map just vanishing. (Other callers leave it out: deleting a map
 * removes its content before its list entry, which is not a loss.)
 */
export function loadRegistry(onMissing?: (missing: Registry) => void): Registry {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    let registry: Registry = [];
    if (raw !== null) {
      try {
        registry = readRegistry(JSON.parse(raw)) ?? [];
      } catch {
        registry = [];
      }
    }
    const stored = new Set(storedMapIds());
    // A deleted map's record stays stored until erased: not one to list
    // (not even when a retried save listed it again).
    const trashed = new Set<string>(loadMapTrash().map((m) => m.id));
    let reconciled: Registry = registry.filter((m) => stored.has(m.id) && !trashed.has(m.id));
    const missing = registry.filter((m) => !stored.has(m.id));
    for (const id of trashed) stored.delete(id as MapId);
    if (missing.length > 0) onMissing?.(missing);
    for (const id of stored) {
      if (reconciled.some((m) => m.id === id)) continue;
      // Only the name is needed, so the page size passed here never matters.
      const read = parse(localStorage.getItem(MAP_KEY_PREFIX + id) ?? "", { width: 1, height: 1 });
      reconciled = upsertMap(reconciled, { id, name: read.status === "unreadable" ? DAMAGED_MAP_NAME : read.map.name });
    }
    if (reconciled.length !== registry.length || reconciled.some((m, i) => m !== registry[i])) {
      writeRegistry(reconciled);
    }
    return reconciled;
  } catch {
    return [];
  }
}

/**
 * Maps whose latest save failed, as they were meant to be saved. Until a
 * retry stores them, `loadMap` looks here first, so switching to one (or
 * exporting it) gets its real content in this session instead of the stale
 * stored copy -- or, for a map whose first save failed, nothing.
 */
const unsaved = new Map<MapId, LinkMap>();

/**
 * Each map as this tab last read or wrote it, with the record's `rev` at
 * that moment: the `base` of the merge in `domain/merge.ts`. A stored
 * `rev` different from this one means another tab saved the map since.
 * `map` is `null` when what was read wasn't a clean copy (it was
 * repaired): never skipped as unchanged, and merged as if from empty.
 */
const synced = new Map<MapId, Synced>();

interface Synced {
  readonly rev: number;
  readonly map: LinkMap | null;
  /** Linked maps: the board's `rev` and name (in Boardkit's list) as this
      tab last read or wrote them. For a linked map `map` is the tree the
      board made then, so it compares like for like with the next one. */
  readonly board?: { readonly rev: number; readonly name: string | null };
}

/** Linked maps opened with boxes Linkkit has no place for yet (made in
    Boardkit): the store tidies them in before showing the map. */
const unplacedOnLoad = new Set<MapId>();

/** Whether `loadMap` just opened map `id` with boxes to tidy in (asked
    once: the answer is forgotten). */
export function takeUnplaced(id: MapId): boolean {
  return unplacedOnLoad.delete(id);
}

/** Maps another tab erased while this one had them: never written again
    this session, or a late save would bring an erased map back. */
const deletedElsewhere = new Set<MapId>();

/** A map with nothing in it but `like`'s settings: the merge's base when
    this tab's last read was a repaired copy (Boardkit's empty board). */
const emptyLike = (like: LinkMap): LinkMap => ({ ...like, nodes: {}, links: {}, order: {}, collapsed: [], trash: [] });

/** A stored record as parsed JSON, or `null` when there is none or it
    isn't JSON. */
function storedRecord(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * `mine` caught up with what is stored: when another tab saved the map
 * since this tab last read or wrote it, their version with this tab's own
 * changes re-applied on top (`mergeMaps`), and the user told about any
 * item both changed. Otherwise `mine` itself. A stored record that can't be
 * read at all is left to the caller (written over, as before).
 */
function caughtUp(id: MapId, mine: LinkMap, stored: unknown): LinkMap {
  const base = synced.get(id);
  if (!base || stored === null || revOf(stored) === base.rev) return mine;
  const read = readMap(stored, mine.page);
  if (read.status === "unreadable") return mine;
  const { map, conflicts } = mergeMaps(base.map ?? emptyLike(mine), mine, read.map);
  synced.set(id, { rev: revOf(stored), map: read.map });
  useSyncNotice.getState().conflicted(conflicts);
  return map;
}

/*
 * Linked trees (shared store, bridge step 3). The shared parts live in
 * Boardkit's board record (`persistBoard.ts`), Linkkit's own parts (and a
 * copy of the shared ones) in `linkkit:map:<id>`. Two records, two `rev`s,
 * one merge: the tree the board makes now, over the stored copy, is
 * "theirs", whoever changed either record (a Boardkit tab, another Linkkit
 * tab), and `mergeMaps` re-applies this tab's changes on top.
 */

/** What is stored for a linked map now. */
type LinkedStored =
  /** The tree the board makes, with the stored copy's own parts (this
      tab's map when there is no readable copy). */
  | {
      readonly kind: "tree";
      readonly map: LinkMap;
      readonly unplaced: readonly NodeId[];
      /** The stored copy as read, if any, and its `rev`. */
      readonly copy: LinkMap | null;
      readonly rev: number;
      readonly record: BoardRecord;
      readonly name: string | null;
    }
  /** The board was deleted in Boardkit. */
  | { readonly kind: "gone" }
  /** Another tab unlinked the map: its stored record is an ordinary map
      now (as parsed JSON, for `caughtUp`). */
  | { readonly kind: "unlinked"; readonly stored: unknown }
  /** The board can't be written (a newer Boardkit's, or damaged). */
  | { readonly kind: "held"; readonly reason: HoldReason };

function storedLinked(mine: LinkMap & { readonly linkedBoard: string }): LinkedStored {
  const stored = storedRecord(MAP_KEY_PREFIX + mine.id);
  const read = stored === null ? null : readMap(stored, mine.page);
  if (read && read.status !== "unreadable" && !read.map.linkedBoard) return { kind: "unlinked", stored };
  const board = loadBoard(mine.linkedBoard);
  if (board.status === "missing") return { kind: "gone" };
  if (board.status !== "ok") return { kind: "held", reason: board.status };
  const copy = read && read.status !== "unreadable" && read.map.linkedBoard === mine.linkedBoard ? read.map : null;
  const name = loadBoardName(mine.linkedBoard);
  const { map, unplaced } = linkedTree(copy ?? mine, name, board.record.board);
  return { kind: "tree", map, unplaced, copy, rev: revOf(stored), record: board.record, name };
}

const isLinked = (map: LinkMap): map is LinkMap & { readonly linkedBoard: string } => !!map.linkedBoard;

/**
 * `caughtUp` for a linked map: when either record changed since this tab
 * last read or wrote them, the tree they make now with this tab's changes
 * re-applied. A deleted board leaves `mine` as an ordinary tree (the user
 * is told); a board Linkkit can't write holds the map read-only.
 */
function caughtUpLinked(id: MapId, mine: LinkMap, now: LinkedStored): LinkMap {
  if (now.kind === "gone") {
    useLinkHold.getState().release(id);
    useSyncNotice.getState().boardDeleted(mine.name);
    return unlinked(mine);
  }
  if (now.kind === "unlinked") {
    useLinkHold.getState().release(id);
    return caughtUp(id, unlinked(mine), now.stored);
  }
  if (now.kind === "held") {
    useLinkHold.getState().hold(id, now.reason);
    return mine;
  }
  useLinkHold.getState().release(id);
  const base = synced.get(id);
  if (base?.board && base.rev === now.rev && base.board.rev === now.record.rev && base.board.name === now.name) {
    return mine;
  }
  const { map, conflicts } = base?.map ? mergeMaps(base.map, mine, now.map) : { map: mine, conflicts: [] };
  synced.set(id, { rev: now.rev, map: now.map, board: { rev: now.record.rev, name: now.name } });
  useSyncNotice.getState().conflicted(conflicts);
  return withStartName(map);
}

/**
 * Saves a linked map: the shared part first (the board record, then its
 * name in Boardkit's list), Linkkit's part second, each only when it
 * changed. If the shared write fails, Linkkit's part isn't written either:
 * the change waits in memory, behind the usual banner, and its retry goes
 * through the same `rev` check. If Linkkit's part fails after the shared
 * one stored, Boardkit is already right; a box new to the board just has
 * no place stored, and is tidied in on the next open.
 *
 * Returns what was stored (or kept to retry): the tree the board now
 * makes, which an ordinary save then writes when the board was deleted.
 */
function saveLinked(map: LinkMap & { readonly linkedBoard: string }): LinkMap {
  const key = MAP_KEY_PREFIX + map.id;
  const sharedKey = boardKey(map.linkedBoard);
  let written: LinkMap = map;
  // The key whose write is under way: still set if anything throws.
  let failing: string | null = key;
  try {
    const now = storedLinked(map);
    written = caughtUpLinked(map.id, map, now);
    if (now.kind === "tree") {
      const result = treeToBoard(now.record.board, written, Date.now());
      if (!result.ok) {
        // An edit merged with another app's (a list over Boardkit's limit):
        // the board as stored stays.
        useSyncNotice.getState().say(`${problemText(written, result.problems[0])} The version in Boardkit was kept.`);
        written = now.map;
      } else {
        let record = now.record;
        failing = sharedKey;
        if (result.changed) {
          record = nextRecord(now.record, result.board);
          writeBoard(map.linkedBoard, record);
        }
        if (now.name !== null && result.name !== now.name) writeBoardName(map.linkedBoard, result.name);
        const derived = linkedTree(written, result.name, record.board).map;
        failing = key;
        let rev = now.rev;
        if (!now.copy || !sameMap(derived, now.copy)) {
          rev = now.rev + 1;
          localStorage.setItem(key, JSON.stringify(serializeStored(derived, rev)));
        }
        synced.set(map.id, { rev, map: derived, board: { rev: record.rev, name: now.name === null ? null : result.name } });
        written = derived;
      }
    }
    failing = null;
  } catch {
    // See the module comment: failing to save is not fatal.
  }
  const ok = failing === null;
  // A shared write that stored clears its banner even if Linkkit's failed.
  useSaveHealth.getState().report(sharedKey, failing !== sharedKey, () => saveMap(unsaved.get(map.id) ?? written));
  useSaveHealth.getState().report(key, failing !== key, () => saveMap(unsaved.get(map.id) ?? written));
  if (!ok) unsaved.set(map.id, written);
  else unsaved.delete(map.id);
  return written;
}

/**
 * "Link to Boardkit": stores the new board (`createBoard`) and then the map
 * in its linked form, in place of the ordinary record. The old record stays
 * as it is until the linked one is stored over it, and if that write fails
 * the board is taken back, so a failed link leaves everything as it was.
 * Returns whether it was linked.
 */
export function linkStoredMap(linked: LinkMap & { readonly linkedBoard: string }, name: string, board: BoardContent): boolean {
  const key = MAP_KEY_PREFIX + linked.id;
  let rev: number;
  try {
    rev = revOf(storedRecord(key)) + 1;
    createBoard(linked.linkedBoard, name, { version: BOARD_RECORD_VERSION, rev: 1, board });
  } catch {
    return false;
  }
  try {
    localStorage.setItem(key, JSON.stringify(serializeStored(linked, rev)));
  } catch {
    try {
      removeBoard(linked.linkedBoard);
    } catch {
      // Left in Boardkit as an ordinary board: nothing is lost.
    }
    return false;
  }
  synced.set(linked.id, { rev, map: linked, board: { rev: 1, name } });
  unsaved.delete(linked.id);
  writeRegistry(upsertMap(loadRegistry(), { id: linked.id, name: linked.name }));
  return true;
}

const mergedListeners: ((id: MapId, from: LinkMap, merged: LinkMap) => void)[] = [];

/** Tells `listener` when a save merged in another tab's save: `from` is
    what this tab asked to store, `merged` what was stored (or, if that
    failed, kept to retry). The store (`mapStore.ts`, which imports this
    module) puts it on screen. */
export function onMapMerged(listener: (id: MapId, from: LinkMap, merged: LinkMap) => void): void {
  mergedListeners.push(listener);
}

/**
 * Writes a map, then its list entry (name) -- the entry only once the map
 * itself is stored, so a failed first save never leaves the list naming a
 * map with nothing behind it. The retry the banner keeps is this whole save,
 * so a map that finally stores gets its entry then.
 *
 * Every write raises the stored record's `rev` by one, read from storage
 * (not remembered), so it keeps counting up whoever wrote last. If another
 * tab saved the map since this tab's last read or write, theirs is merged
 * in first, never written over. A write that would store nothing new (a
 * map just taken from another tab) is skipped, so tabs don't echo each
 * other's saves back and forth.
 */
export function saveMap(toSave: LinkMap): void {
  if (deletedElsewhere.has(toSave.id)) return;
  let map = toSave;
  if (isLinked(map)) {
    const written = saveLinked(map);
    if (!sameMap(written, map)) for (const listener of mergedListeners) listener(map.id, map, written);
    if (isLinked(written)) {
      if (!unsaved.has(map.id)) writeRegistry(upsertMap(loadRegistry(), { id: map.id, name: written.name }));
      return;
    }
    // Its board was deleted in Boardkit: an ordinary tree from now on.
    map = written;
  }
  const key = MAP_KEY_PREFIX + map.id;
  let written = map;
  let ok = true;
  try {
    const stored = storedRecord(key);
    written = caughtUp(map.id, map, stored);
    const rev = revOf(stored);
    const base = synced.get(map.id);
    if (!(base?.map && base.rev === rev && sameMap(written, base.map))) {
      localStorage.setItem(key, JSON.stringify(serializeMap(written, rev + 1)));
      synced.set(map.id, { rev: rev + 1, map: written });
    }
  } catch {
    // See the module comment: failing to save is not fatal.
    ok = false;
  }
  // The retry saves the latest unsaved copy: another tab's save may have
  // been merged into it since.
  useSaveHealth.getState().report(key, ok, () => saveMap(unsaved.get(map.id) ?? written));
  if (written !== map) for (const listener of mergedListeners) listener(map.id, map, written);
  if (!ok) {
    unsaved.set(map.id, written);
    return;
  }
  unsaved.delete(map.id);
  writeRegistry(upsertMap(loadRegistry(), { id: map.id, name: written.name }));
}

/** What another tab's save means for the map this tab has open. */
export type CatchUp =
  /** Nothing stored since this tab's last read or write, or nothing this
      tab can use (an unreadable record; it is left to the next save). */
  | { readonly kind: "current" }
  /** Theirs, with this tab's unsaved changes re-applied (`mergeMaps`). */
  | { readonly kind: "merged"; readonly map: LinkMap }
  /** Erased in another tab. */
  | { readonly kind: "deleted" };

/**
 * Called when another tab stored a map (the browser's `storage` event):
 * `mine` is this tab's copy, unsaved changes and all.
 */
export function catchUpMap(id: MapId, mine: LinkMap): CatchUp {
  if (deletedElsewhere.has(id)) return { kind: "current" };
  let stored: unknown;
  try {
    if (localStorage.getItem(MAP_KEY_PREFIX + id) === null) {
      if (!synced.has(id)) return { kind: "current" };
      forgetMapDeletedElsewhere(id);
      return { kind: "deleted" };
    }
    stored = storedRecord(MAP_KEY_PREFIX + id);
  } catch {
    return { kind: "current" };
  }
  let map: LinkMap;
  try {
    map = isLinked(mine) ? caughtUpLinked(id, mine, storedLinked(mine)) : caughtUp(id, mine, stored);
  } catch {
    return { kind: "current" };
  }
  if (map === mine) return { kind: "current" };
  // A save still failing keeps its retry copy up to date too.
  if (unsaved.has(id)) unsaved.set(id, map);
  return { kind: "merged", map };
}

/**
 * Another tab erased this map. Its unsaved copy and failed write are
 * dropped, and nothing writes it again this session: the other tab erased
 * it on purpose (emptying the trash), so its erase stands.
 */
export function forgetMapDeletedElsewhere(id: MapId): void {
  deletedElsewhere.add(id);
  synced.delete(id);
  unsaved.delete(id);
  useSaveHealth.getState().forget(MAP_KEY_PREFIX + id);
}

/** A map stored again by another tab (restored from a file) may be
    written again, even if it was erased earlier this session. */
export function allowMapWrites(id: MapId): void {
  deletedElsewhere.delete(id);
}

/** The map id a storage key holds, or `null` for any other key. */
export function mapIdOfKey(key: string): MapId | null {
  return key.startsWith(MAP_KEY_PREFIX) ? (key.slice(MAP_KEY_PREFIX.length) as MapId) : null;
}

/** Whether a storage key is the map list or the deleted maps' list. */
export const isListKey = (key: string): boolean => key === REGISTRY_KEY || key === MAP_TRASH_KEY;

export function deleteStoredMap(id: MapId): void {
  try {
    localStorage.removeItem(MAP_KEY_PREFIX + id);
  } catch {
    // Nothing to do: the list below still forgets it.
  }
  unsaved.delete(id);
  synced.delete(id);
  useSaveHealth.getState().forget(MAP_KEY_PREFIX + id);
  writeRegistry(removeMap(loadRegistry(), id));
}

/** Takes a map off the list, keeping its stored record (it went to the
    trash). The list is written first: if the trash's own list then fails
    to save, the map comes back on the next visit rather than being lost. */
export function unlistStoredMap(id: MapId): void {
  unsaved.delete(id);
  writeRegistry(removeMap(loadRegistry(), id));
}

/** The deleted maps, oldest first. One whose record is gone is dropped. */
export function loadMapTrash(): MapTrash {
  try {
    const raw = localStorage.getItem(MAP_TRASH_KEY);
    if (raw === null) return [];
    let trash: MapTrash;
    try {
      trash = readMapTrash(JSON.parse(raw));
    } catch {
      return [];
    }
    return trash.filter((m) => localStorage.getItem(MAP_KEY_PREFIX + m.id) !== null);
  } catch {
    return [];
  }
}

export function saveMapTrash(trash: MapTrash): void {
  tryWrite(MAP_TRASH_KEY, JSON.stringify(serializeMapTrash(trash)));
}

export function loadActiveMapId(): MapId | null {
  try {
    return localStorage.getItem(ACTIVE_KEY) as MapId | null;
  } catch {
    return null;
  }
}

export function saveActiveMapId(id: MapId): void {
  tryWrite(ACTIVE_KEY, id);
}

/**
 * The example map a first-ever visit opened, remembered until it is first
 * changed. While it is the only map, Linkkit counts as empty: "Restore all
 * maps from a file" is offered, and restoring takes the untouched example
 * away (nothing of the user's is lost).
 */
export function loadStarterId(): MapId | null {
  try {
    return localStorage.getItem(STARTER_KEY) as MapId | null;
  } catch {
    return null;
  }
}

export function saveStarterId(id: MapId | null): void {
  if (id !== null) {
    tryWrite(STARTER_KEY, id);
    return;
  }
  try {
    localStorage.removeItem(STARTER_KEY);
  } catch {
    // Not fatal: at worst the restore is offered once more.
  }
  useSaveHealth.getState().forget(STARTER_KEY);
}

/**
 * Reads one map, or `null` if it is missing or nothing could be salvaged.
 *
 * A damaged map still opens, repaired as far as possible -- but first its
 * saved text is copied, untouched, to a `linkkit:damaged:` key, because the
 * next auto-save overwrites the map's own key. Without that copy,
 * "repaired" would quietly mean "whatever the repair kept".
 */
export function loadMap(id: MapId, fallbackPage: Size): LinkMap | null {
  // Its latest save failed this session: that content is the real map.
  // Another tab may have saved it since: merged in, like any write.
  const pending = unsaved.get(id);
  if (pending) {
    let map = pending;
    try {
      map = isLinked(pending)
        ? caughtUpLinked(id, pending, storedLinked(pending))
        : caughtUp(id, pending, storedRecord(MAP_KEY_PREFIX + id));
    } catch {
      // Unreadable storage: the unsaved copy is all there is.
    }
    unsaved.set(id, map);
    return map;
  }
  try {
    const raw = localStorage.getItem(MAP_KEY_PREFIX + id);
    if (raw === null) return null;
    const read = parse(raw, fallbackPage);
    let rev = 0;
    try {
      rev = revOf(JSON.parse(raw));
    } catch {
      // Not JSON: unreadable, below.
    }
    if (read.status !== "unreadable") synced.set(id, { rev, map: read.status === "ok" ? read.map : null });
    if (read.status === "ok") return opened(read.map);

    const asideKey = `${DAMAGED_KEY_PREFIX}${id}:${Date.now()}`;
    // Say where the original is only if it really got there. With storage
    // full the copy fails, and the map's own key is all that is left (the
    // next save of a repaired map writes over it).
    const keptAside = tryWrite(asideKey, raw, false);
    const where = keptAside
      ? `The original is kept in localStorage under "${asideKey}".`
      : `The original could NOT be kept aside (storage is full or blocked); it is still under "${MAP_KEY_PREFIX}${id}" until this map is next saved.`;
    console.warn(
      read.status === "repaired"
        ? `Linkkit: a saved map was damaged and has been repaired (${read.fixes} fixes). ${where}`
        : `Linkkit: a saved map could not be read. ${where}`,
    );
    return read.status === "repaired" ? opened(read.map) : null;
  } catch {
    return null;
  }
}

/** A map just read from storage, as it opens: a linked one is built from
    its board (`openLinked`), any other is as read. */
const opened = (map: LinkMap): LinkMap => (isLinked(map) ? openLinked(map) : map);

/**
 * A linked map as it opens, from Linkkit's stored `copy`: the tree its
 * board makes. Boxes made in Boardkit since are tidied in before it shows
 * (`takeUnplaced`); otherwise, when Boardkit changed anything, the copy is
 * refreshed at once. A deleted board leaves the copy as an ordinary tree,
 * stored as one; a board Linkkit can't write opens the copy read-only.
 */
function openLinked(copy: LinkMap & { readonly linkedBoard: string }): LinkMap {
  const now = storedLinked(copy);
  if (now.kind !== "tree") {
    const map = caughtUpLinked(copy.id, copy, now);
    if (now.kind === "gone") saveMap(map);
    return map;
  }
  useLinkHold.getState().release(copy.id);
  synced.set(copy.id, { rev: now.rev, map: now.map, board: { rev: now.record.rev, name: now.name } });
  if (now.unplaced.length > 0) unplacedOnLoad.add(copy.id);
  else if (!sameMap(now.map, copy)) saveMap(now.map);
  return now.map;
}
