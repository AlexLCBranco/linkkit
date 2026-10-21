/**
 * This page's own writes to Linkkit's and Boardkit's keys. The browser's
 * `storage` event tells only the OTHER tabs of a write; on the gauntlet
 * whiteboard one page shows several maps (and Boardkit's boards) at once,
 * so what shows a map that isn't being edited, and Boardkit beside it,
 * hear of this page's writes here (`app/whiteboard/`). Told once per key
 * per task, after the write.
 */
type Listener = (key: string) => void;

const listeners = new Set<Listener>();
let waiting: Set<string> | null = null;

export function wroteHere(key: string): void {
  if (waiting) {
    waiting.add(key);
    return;
  }
  waiting = new Set([key]);
  queueMicrotask(() => {
    const keys = waiting ?? new Set<string>();
    waiting = null;
    for (const k of keys) for (const listener of [...listeners]) listener(k);
  });
}

/** Returns a stop function. */
export function onWroteHere(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
