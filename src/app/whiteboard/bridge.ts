import { takeStoredElsewhere } from "../../store/mapStore";
import { onWroteHere } from "../../store/storedHere";

/**
 * The gauntlet whiteboard shows Linkkit's maps and Boardkit's boards on one
 * page. The browser's `storage` event tells only OTHER tabs of a write, so
 * the two apps on that page tell each other here: the whiteboard passes
 * Boardkit's writes in (`keyStoredElsewhere`, as if another tab had made
 * them), and Linkkit's own writes out (`onWroteHere`).
 */

type KeyListener = (key: string) => void;

const fromBoardkit = new Set<KeyListener>();

/** Boardkit, on this page, stored (or removed: `removed`) storage key
    `key`: taken in as another tab's write, and shown. */
export function keyStoredElsewhere(key: string, removed = false): void {
  takeStoredElsewhere(key, removed);
  for (const listener of [...fromBoardkit]) listener(key);
}

/**
 * Calls `listener` with the key of every stored change a map shown here may
 * need to show: another tab's, Boardkit's on this page, and Linkkit's own
 * (the map being edited saving, an undo from the page). `"*"`: another tab
 * cleared all of storage. Returns a stop function.
 */
export function onKeyChanged(listener: KeyListener): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === localStorage) listener(event.key ?? "*");
  };
  window.addEventListener("storage", onStorage);
  fromBoardkit.add(listener);
  const stopHere = onWroteHere(listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    fromBoardkit.delete(listener);
    stopHere();
  };
}

export { onWroteHere };
