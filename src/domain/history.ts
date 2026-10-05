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
 */
export type MapPatch = Partial<LinkMap>;

export interface HistoryEntry {
  readonly before: MapPatch;
  readonly after: MapPatch;
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
  return { before: before as MapPatch, after: after as MapPatch };
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
 * both touched, since that is the value from before either change.
 */
export function amendLast(history: History, prev: LinkMap, next: LinkMap): History {
  const last = history.past.at(-1);
  if (!last) return record(history, prev, next);
  const entry = diff(prev, next);
  if (isEmpty(entry.after)) return history;
  const merged: HistoryEntry = {
    before: { ...entry.before, ...last.before },
    after: { ...last.after, ...entry.after },
  };
  return { past: [...history.past.slice(0, -1), merged], future: [] };
}

export function undo(history: History, map: LinkMap): { history: History; map: LinkMap } | null {
  const entry = history.past.at(-1);
  if (!entry) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, entry] },
    map: { ...map, ...entry.before },
  };
}

export function redo(history: History, map: LinkMap): { history: History; map: LinkMap } | null {
  const entry = history.future.at(-1);
  if (!entry) return null;
  return {
    history: { past: [...history.past, entry], future: history.future.slice(0, -1) },
    map: { ...map, ...entry.after },
  };
}

/**
 * Takes the last step back and forgets it, with nothing left to redo: a
 * box added and then left without a name leaves no trace in the history.
 */
export function discardLast(history: History, map: LinkMap): { history: History; map: LinkMap } | null {
  const step = undo(history, map);
  return step && { history: { ...step.history, future: history.future }, map: step.map };
}
