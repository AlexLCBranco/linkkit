import { saveActiveMapId, saveMap } from "./persistMap";
import { useSaveHealth } from "./saveHealth";
import { flushSave, scheduleSave } from "./saveQueue";
import { useMapStore, type MapState } from "./mapStore";

/**
 * Saves the open map shortly after every change. Called once from
 * `main.tsx`.
 *
 * Nothing is saved while the map still waits for its first Tidy up (the
 * example, before its boxes are measured): its boxes are all stacked on one
 * spot, and a reload in that moment must start over and tidy again, not
 * reopen the stack. The tidy itself is a change, so it saves.
 */
/** The save-failed banner's "Try again", after the user has made room:
    makes every failed write again (maps that aren't open too, with the text
    each last tried to store), then saves the open map as it is now, so its
    latest state is what ends up saved. */
export function saveOpenMapNow(): void {
  flushSave();
  useSaveHealth.getState().retryAll();
  const { map, needsTidy } = useMapStore.getState();
  if (needsTidy) return;
  saveMap(map);
  saveActiveMapId(map.id);
}

/** Whether a linked map's save waits: a box just added is still being
    named. Saved now, it would reach Boardkit as an untitled card and,
    taken back with Esc, land in Boardkit's trash, where a box never kept
    doesn't belong. It saves once typing ends (a box left blank is kept,
    and reaches Boardkit as a card with an empty title). */
const waitsForName = (state: MapState): boolean =>
  !!state.map.linkedBoard && state.editing?.kind === "box" && state.map.nodes[state.editing.id]?.name === "";

export function initAutoSave(): void {
  useMapStore.subscribe((state, prev) => {
    if (state.needsTidy || waitsForName(state)) return;
    const named = waitsForName(prev);
    if (state.map === prev.map && state.needsTidy === prev.needsTidy && !named) return;
    // The map is read when the save runs, not now, so one write covers a
    // whole burst of edits.
    scheduleSave(() => useMapStore.getState().map);
    // A tree shared with Boardkit saves at once, so a Boardkit tab open
    // beside it sees each change as it happens.
    if (state.map.linkedBoard) flushSave();
    saveActiveMapId(state.map.id);
  });

  // A pending save must not be lost when the tab closes or is hidden (on
  // mobile, hidden is often the last event a page ever gets).
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}
