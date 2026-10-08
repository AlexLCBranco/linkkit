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
