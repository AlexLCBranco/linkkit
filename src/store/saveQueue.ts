import type { LinkMap } from "../domain/types";
import { saveMap } from "./persistMap";

/**
 * The pending auto-save, if any (as in Treekit). Its own module so both the
 * auto-saver (which schedules) and the store can reach it without importing
 * each other. The store must flush before switching maps: a pending save
 * reads the store when it runs, so after a switch it would read the *new*
 * map, and the old map's last edits would never be written.
 */
const SAVE_DELAY_MS = 400;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: (() => LinkMap) | null = null;

/** Saves `read()` after a short quiet period; a newer call replaces it. */
export function scheduleSave(read: () => LinkMap): void {
  if (timer !== null) clearTimeout(timer);
  pending = read;
  timer = setTimeout(flushSave, SAVE_DELAY_MS);
}

/** Writes the pending save now, if there is one. */
export function flushSave(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  const read = pending;
  pending = null;
  if (read) saveMap(read());
}

/** Drops the pending save (the map it belongs to was just deleted). */
export function cancelSave(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  pending = null;
}
