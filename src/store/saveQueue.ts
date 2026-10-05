import type { LinkMap } from "../domain/types";
import { saveMap } from "./persistMap";

/**
 * The pending auto-save, if any (as in Treekit). Its own module so both the
 * auto-saver (which schedules) and, later, the store (which must flush
 * before switching maps) can reach it without importing each other.
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
