import type { Bounds } from "./layout";
import type { PageAlign } from "./page";
import type { Size } from "./types";

/** Zoom steps, the same as Treekit's and Boardkit's: 50% to 200% in 10% steps. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

/** Keeps a zoom inside the range, rounded to whole percents so repeated
    steps never drift (in floating point, 0.1 + 0.2 is 0.30000000000000004). */
export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
}

export function zoomedIn(zoom: number): number {
  return clampZoom(zoom + ZOOM_STEP);
}

export function zoomedOut(zoom: number): number {
  return clampZoom(zoom - ZOOM_STEP);
}

/**
 * The page as drawn at `zoom`. Zoom is a magnifying glass over the page:
 * the boxes keep their places (in page units), only the drawing scales.
 * As in Treekit, what scrolls is the zoomed page: the scrolling area is the
 * screen, and bigger (scrollbars appear) only on an axis where the zoomed
 * page does not fit. On an axis where it fits with room to spare (zoomed
 * out), it sits where the Align panel says: centred, or flush to a side.
 *
 * `width`/`height`: the scrolling area; `x`/`y`: where the page's top-left
 * corner is drawn in it; `zoom`: the scale. A page point p is drawn at
 * p * zoom + x (and y).
 */
export interface ZoomedPage {
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export function zoomPage(page: Size, screen: Size, zoom: number, align: PageAlign): ZoomedPage {
  const axis = (size: number, room: number, a: PageAlign["x"]) => {
    const drawn = size * zoom;
    if (drawn >= room) return { area: Math.ceil(drawn), offset: 0 };
    const free = room - drawn;
    return { area: room, offset: a === "start" ? 0 : a === "center" ? free / 2 : free };
  };
  const x = axis(page.width, screen.width, align.x);
  const y = axis(page.height, screen.height, align.y);
  return { width: x.area, height: y.area, x: x.offset, y: y.offset, zoom };
}

/**
 * Where to scroll after a zoom so the spot in the middle of the screen
 * stays in the middle (as far as the scrollbars allow; the browser stops
 * them at the ends). `view` is the scrolled-to part, in the drawn pixels of
 * `before`.
 */
export function scrollAfterZoom(
  view: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  before: Pick<ZoomedPage, "x" | "y" | "zoom">,
  after: Pick<ZoomedPage, "x" | "y" | "zoom">,
): { left: number; top: number } {
  const midX = (view.left + view.width / 2 - before.x) / before.zoom;
  const midY = (view.top + view.height / 2 - before.y) / before.zoom;
  return {
    left: Math.max(0, midX * after.zoom + after.x - view.width / 2),
    top: Math.max(0, midY * after.zoom + after.y - view.height / 2),
  };
}

/** The smallest zoom fitting a map to the window may use: below the pill's
    50%, so a wide map fits a narrow window too. */
export const FIT_ZOOM_MIN = 0.1;

/**
 * The zoom that shows every box at once (fit to view on open, owner,
 * 2026-10-19): `content` (the boxes' outer edges, in page units) with
 * `margin` screen pixels round it. Never above 100%: a map that fits as it
 * is stays at 100%. Rounded down to whole percents, so it really fits.
 */
export function fitZoom(content: Bounds, screen: Size, margin: number): number {
  const width = content.right - content.left;
  const height = content.bottom - content.top;
  const fit = Math.min(
    1,
    width > 0 ? (screen.width - 2 * margin) / width : 1,
    height > 0 ? (screen.height - 2 * margin) / height : 1,
  );
  return Math.max(FIT_ZOOM_MIN, Math.floor(fit * 100) / 100);
}

/**
 * Where to scroll so `content` starts `margin` in from the screen's
 * top-left corner, on the page as drawn (`drawn`). The browser stops the
 * scroll at the page's ends, so on an axis where everything fits this
 * ends up 0.
 */
export function scrollToContent(content: Bounds, drawn: Pick<ZoomedPage, "x" | "y" | "zoom">, margin: number): { left: number; top: number } {
  return {
    left: Math.max(0, Math.floor(content.left * drawn.zoom + drawn.x - margin)),
    top: Math.max(0, Math.floor(content.top * drawn.zoom + drawn.y - margin)),
  };
}
