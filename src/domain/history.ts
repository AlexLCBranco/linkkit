import { mergeMaps, type MergeConflict } from "./merge";
import type { LinkMap } from "./types";

/**
 * Undo/redo over a stack of patches, not full snapshots (Treekit's and
 * Boardkit's design).
 *
 * Every edit in `map.ts` copies only the parts of the map it touches
 * (`nodes`, `links`, `page`, `name`) and leaves the rest at their old
 * reference. So the difference between two maps is simply "which top-level
 * parts changed identity", and keeping those parts' old and new values is a
 * complete undo record -- no per-action undo code, and no copy of the
 * untouched parts on every step.
 *
 * Changes from outside (another tab, or Boardkit for a linked tree; step
 * 26) don't clear the history. While the map is still exactly as the step
 * left it, the step is undone by putting its old parts back, as always.
 * Otherwise something came in from outside since, and the step is undone
 * as a merge (`mergeMaps`): base = the map as the step left it, mine = as
 * it was before, theirs = the map now. For that each step keeps the two
 * whole maps it went between (references to their parts, nothing copied).
 * Rebuilding them from the step's own parts plus today's others mixed two
 * moments, and checking only the step's own parts missed outside changes
 * to the others: an arrow another tab drew to a box the step added
 * survived the undo pointing at nothing (found by `stress.test.ts`; the
 * bug Boardkit fixed in v0.0.87). Only the items the step changed go back;
 * the rest stays as it is now. An item the step changed that was also
 * changed from outside is a conflict: the undo is refused, and that step and
 * every older one are dropped (skipping just it could make a map that never
 * existed), as decided under Bridge mapping. Redo the same way round.
 */
export type MapPatch = Partial<LinkMap>;

export interface HistoryEntry {
  readonly before: MapPatch;
  readonly after: MapPatch;
  /** The whole map just before the step, and just after it. */
  readonly prev: LinkMap;
  readonly next: LinkMap;
}

export interface History {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

/** Bounded so a long session's undo stack cannot grow without limit. */
const HISTORY_LIMIT = 200;

/** The parts that changed between two maps, old and new. */
function diff(prev: LinkMap, next: LinkMap): HistoryEntry {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof LinkMap)[]) {
    if (prev[key] !== next[key]) {
      before[key] = prev[key];
      after[key] = next[key];
    }
  }
  return { before: before as MapPatch, after: after as MapPatch, prev, next };
}

const isEmpty = (patch: MapPatch) => Object.keys(patch).length === 0;

/**
 * Records `prev -> next` as one step. A step that changed nothing is
 * dropped. Any real step clears `future`: redo only replays what undo just
 * walked back through.
 */
export function record(history: History, prev: LinkMap, next: LinkMap): History {
  const entry = diff(prev, next);
  if (isEmpty(entry.after)) return history;
  return { past: [...history.past, entry].slice(-HISTORY_LIMIT), future: [] };
}

/**
 * Folds `prev -> next` into the most recent step instead of adding a new
 * one: a whole drag is one step, not one per pixel, and "add a box, type
 * its name" undoes in one go. The older step's `before` wins for any part
 * both touched, since that is the value from before either change. When
 * something came in from outside in between (the step no longer ends at
 * `prev`), this is a step of its own: folded in, undoing it would take
 * back what came in too.
 */
export function amendLast(history: History, prev: LinkMap, next: LinkMap): History {
  const last = history.past.at(-1);
  if (!last || last.next !== prev) return record(history, prev, next);
  const entry = diff(prev, next);
  if (isEmpty(entry.after)) return history;
  const merged: HistoryEntry = {
    before: { ...entry.before, ...last.before },
    after: { ...last.after, ...entry.after },
    prev: last.prev,
    next,
  };
  return { past: [...history.past.slice(0, -1), merged], future: [] };
}

/**
 * An undo or redo taken: the new history and map. Refused when `conflicts`
 * isn't empty (items changed from outside since): `map` is then the map
 * unchanged, and `history` has lost the refused step and everything
 * behind it.
 */
export interface Step {
  readonly history: History;
  readonly map: LinkMap;
  readonly conflicts: readonly MergeConflict[];
}

/** Whether `map` holds exactly `whole`'s parts: nothing changed since. */
function untouched(map: LinkMap, whole: LinkMap): boolean {
  const keys = new Set([...Object.keys(map), ...Object.keys(whole)] as (keyof LinkMap)[]);
  return [...keys].every((key) => map[key] === whole[key]);
}

/** `map` taken across `entry`, back (undo) or forward (redo): directly
    while `map` is still exactly the map that side left, else item by item
    (see the file comment). */
function apply(
  map: LinkMap,
  entry: HistoryEntry,
  action: "undo" | "redo",
): { map: LinkMap; conflicts: readonly MergeConflict[] } {
  const [from, to, patch] =
    action === "undo" ? [entry.next, entry.prev, entry.before] : [entry.prev, entry.next, entry.after];
  if (untouched(map, from)) return { map: { ...map, ...patch }, conflicts: [] };
  return mergeMaps(from, to, map);
}

export function undo(history: History, map: LinkMap): Step | null {
  const entry = history.past.at(-1);
  if (!entry) return null;
  const done = apply(map, entry, "undo");
  // Refused: what was undone before stays to redo.
  if (done.conflicts.length) return { history: { past: [], future: history.future }, map, conflicts: done.conflicts };
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, entry] },
    map: done.map,
    conflicts: [],
  };
}

export function redo(history: History, map: LinkMap): Step | null {
  const entry = history.future.at(-1);
  if (!entry) return null;
  const done = apply(map, entry, "redo");
  // Refused: this step and every one redoable after it go.
  if (done.conflicts.length) return { history: { past: history.past, future: [] }, map, conflicts: done.conflicts };
  return {
    history: { past: [...history.past, entry], future: history.future.slice(0, -1) },
    map: done.map,
    conflicts: [],
  };
}

/**
 * Takes the last step back and forgets it, with nothing left to redo: a
 * box added and then left without a name leaves no trace in the history.
 */
export function discardLast(history: History, map: LinkMap): { history: History; map: LinkMap } | null {
  const step = undo(history, map);
  if (!step || step.conflicts.length) return null;
  return { history: { ...step.history, future: history.future }, map: step.map };
}
