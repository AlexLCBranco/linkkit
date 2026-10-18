/**
 * Embed mode (gauntlet canvas, phase 3): `?embed=1&id=<map id>` shows that
 * one map with no menus or app chrome, for a frame on the gauntlet canvas.
 * Pure: callers pass `location.search` in.
 *
 * The canvas and the frame talk by `postMessage` (same origin only):
 *
 *   frame -> canvas  { type: "stone:ready", app, id, status }  on start
 *                    { type: "stone:status", app, id, status } when it changes
 *                    { type: "stone:scroll", app, id, x, y }   after scrolling
 *                    { type: "stone:flushed", app, id, busy }  reply to flush
 *   canvas -> frame  { type: "stone:flush" }      save now; reply with `busy`
 *                                                 (true while something is
 *                                                 being typed: don't unload)
 *                    { type: "stone:scroll-to", x, y }
 *
 * The same protocol is in Boardkit (`app: "boardkit"`).
 */
export interface Embed {
  readonly id: string;
}

/** `ok`: showing the map. `missing`: no map has that id. `deleted`: it was
    deleted (or trashed) while shown. */
export type EmbedStatus = "ok" | "missing" | "deleted";

export function readEmbed(search: string): Embed | null {
  const params = new URLSearchParams(search);
  if (params.get("embed") !== "1") return null;
  const id = params.get("id")?.trim();
  return id ? { id } : null;
}

export type ToFrame = { readonly type: "stone:flush" } | { readonly type: "stone:scroll-to"; readonly x: number; readonly y: number };

/** A message from the canvas, or `null` if it isn't one this frame takes. */
export function readToFrame(data: unknown): ToFrame | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, x, y } = data as Record<string, unknown>;
  if (type === "stone:flush") return { type };
  if (type === "stone:scroll-to" && typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
    return { type, x, y };
  }
  return null;
}
