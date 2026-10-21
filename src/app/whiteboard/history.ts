import type { MapId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { flushSave } from "../../store/saveQueue";
import { closeWhiteboardMap, openWhiteboardMap } from "./maps";

/**
 * Undo and redo of map edits for the gauntlet whiteboard, which keeps one
 * undo for the whole page (its own order of which history acted: its
 * drawing's, a board's or a map's). Linkkit's history stays Linkkit's; this
 * only lets the whiteboard (1) hear of each new undoable map step, and
 * (2) undo or redo a given map's latest step, open or not. Each map's
 * history is kept while another is open (the store parks it, as when
 * switching maps in Linkkit).
 */

/** Set while this module itself undoes or redoes, so that is not a new step. */
let stepping = false;

type StepListener = (event: { readonly mapId: MapId; readonly kind: "step" | "undo" | "redo" }) => void;
const listeners = new Set<StepListener>();

/** Tells `listener` of every map history change not made through
    `undoMap`/`redoMap`: a new step, or Linkkit undoing or redoing by
    itself (its own undo button, say). Returns a stop function. */
export function onMapHistory(listener: StepListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

useMapStore.subscribe((state, prev) => {
  if (stepping || state.history === prev.history || state.map.id !== prev.map.id) return;
  const now = state.history;
  const before = prev.history;
  let kind: "step" | "undo" | "redo" | null = null;
  if (now.past.length === before.past.length - 1 && now.future.length === before.future.length + 1) kind = "undo";
  else if (now.past.length === before.past.length + 1 && now.future.length === before.future.length - 1 && now.future.length > 0)
    kind = "redo";
  else if (now.past.length > 0 && now.past.at(-1) !== before.past.at(-1) && now.future.length === 0) kind = "step";
  if (!kind) return;
  for (const listener of [...listeners]) listener({ mapId: state.map.id, kind });
});

function step(mapId: string, kind: "undo" | "redo"): boolean {
  const wasOpen = useMapStore.getState().map.id === mapId;
  if (!openWhiteboardMap(mapId)) return false;
  const store = useMapStore.getState();
  const before = store.history;
  if ((kind === "undo" ? before.past : before.future).length === 0) {
    if (!wasOpen) closeWhiteboardMap(mapId);
    return false;
  }
  stepping = true;
  try {
    store[kind]();
  } finally {
    stepping = false;
  }
  const done = useMapStore.getState().history !== before;
  // Stored at once, so the map shows it (and other tabs get it) now.
  if (wasOpen) flushSave();
  else closeWhiteboardMap(mapId);
  return done;
}

/** Undoes `mapId`'s latest step; false when it had none (or Linkkit
    refused it: changed elsewhere since, see domain/history.ts). */
export const undoMap = (mapId: string): boolean => step(mapId, "undo");
/** Redoes `mapId`'s latest undone step; false when there is none. */
export const redoMap = (mapId: string): boolean => step(mapId, "redo");
