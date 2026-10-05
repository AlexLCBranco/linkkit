import { saveActiveMapId } from "./persistMap";
import { flushSave, scheduleSave } from "./saveQueue";
import { useMapStore } from "./mapStore";

/**
 * Saves the open map shortly after every change. Called once from
 * `main.tsx`.
 *
 * Nothing is saved while the map still waits for its first Tidy up (the
 * example, before its boxes are measured): its boxes are all stacked on one
 * spot, and a reload in that moment must start over and tidy again, not
 * reopen the stack. The tidy itself is a change, so it saves.
 */
export function initAutoSave(): void {
  useMapStore.subscribe((state, prev) => {
    if (state.needsTidy) return;
    if (state.map === prev.map && state.needsTidy === prev.needsTidy) return;
    // The map is read when the save runs, not now, so one write covers a
    // whole burst of edits.
    scheduleSave(() => useMapStore.getState().map);
    saveActiveMapId(state.map.id);
  });

  // A pending save must not be lost when the tab closes or is hidden (on
  // mobile, hidden is often the last event a page ever gets).
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}
