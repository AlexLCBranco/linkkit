import type { Bounds, MapLayout } from "./layout";
import type { LinkMap, NodeId, Point, Size } from "./types";

/**
 * The page: the sheet the boxes live on. It is the screen (the area the
 * map is shown in), made bigger only where the boxes need more room -- a
 * big tidied map, or a window made smaller -- and then the browser
 * scrolls. The camera never moves. Boxes always stay fully inside the page,
 * which these functions enforce.
 *
 * All the numbers (gutters, minimums) come in as options, so the visual
 * constants live with the UI, not here.
 */

export interface PageInsets {
  /** Space kept clear between any box and the page's edges. */
  readonly edge: number;
}

export interface DefaultPageOptions {
  readonly minWidth: number;
  readonly maxWidth: number;
  /** Subtracted from the window width so the page never touches its sides. */
  readonly viewportGutter: number;
  readonly height: number;
}

/** A new map's page: as wide as the window allows, within limits. */
export function defaultPageSize(viewportWidth: number, options: DefaultPageOptions): Size {
  const width = Math.max(options.minWidth, Math.min(options.maxWidth, viewportWidth - options.viewportGutter));
  return { width: Math.round(width), height: options.height };
}

/** Where a box's centre may go so the whole box stays on the page. */
export function clampToPage(center: Point, size: Size, page: Size, insets: PageInsets): Point {
  const hw = size.width / 2;
  const hh = size.height / 2;
  const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));
  return {
    x: clamp(center.x, hw + insets.edge, page.width - hw - insets.edge),
    y: clamp(center.y, hh + insets.edge, page.height - hh - insets.edge),
  };
}

/**
 * The page's size: the screen, or bigger where the boxes reach further.
 * `except` leaves one box out: the room that box may use is what the
 * screen and the other boxes make, so a lone box can't push the page past
 * the screen by itself.
 */
export function pageSize(
  map: LinkMap,
  sizes: ReadonlyMap<NodeId, Size>,
  fallbackSize: Size,
  insets: PageInsets,
  screen: Size,
  except?: NodeId,
): Size {
  let width = screen.width;
  let height = screen.height;
  for (const node of Object.values(map.nodes)) {
    if (node.id === except) continue;
    const size = sizes.get(node.id) ?? fallbackSize;
    width = Math.max(width, node.x + size.width / 2 + insets.edge);
    height = Math.max(height, node.y + size.height / 2 + insets.edge);
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

/**
 * Puts a finished layout on the screen: centred on it, or on a bigger page
 * if the layout needs more room than the screen has. `margin` is the clear space wanted around the
 * whole layout on each side.
 */
export function placeOnPage(
  layout: MapLayout,
  screen: Size,
  margin: { readonly x: number; readonly y: number },
): { positions: Map<NodeId, Point>; page: Size } {
  const b: Bounds = layout.bounds;
  const needW = b.right - b.left + 2 * margin.x;
  const needH = b.bottom - b.top + 2 * margin.y;
  const next: Size = {
    width: Math.max(screen.width, Math.ceil(needW)),
    height: Math.max(screen.height, Math.ceil(needH)),
  };
  const dx = next.width / 2 - (b.left + b.right) / 2;
  const dy = next.height / 2 - (b.top + b.bottom) / 2;
  const positions = new Map<NodeId, Point>();
  for (const [id, p] of layout.positions) positions.set(id, { x: p.x + dx, y: p.y + dy });
  return { positions, page: next };
}

/**
 * Of the boxes in `ids` (those that just changed size: renamed, or new),
 * the ones that now stick out past the page, and where to move each so it
 * fits again. Each gets the room the screen and the other boxes make (see
 * `pageSize`). Only boxes that changed: a smaller window leaves every box
 * where it is and the page scrolls, instead of piling boxes up on the
 * screen's edge. Boxes not measured yet are left alone.
 */
export function keepOnPage(
  map: LinkMap,
  sizes: ReadonlyMap<NodeId, Size>,
  fallbackSize: Size,
  insets: PageInsets,
  screen: Size,
  ids: Iterable<NodeId>,
): Map<NodeId, Point> {
  const moves = new Map<NodeId, Point>();
  for (const id of ids) {
    const node = map.nodes[id];
    const size = sizes.get(id);
    if (!node || !size) continue;
    const room = pageSize(map, sizes, fallbackSize, insets, screen, node.id);
    const at = clampToPage(node, size, room, insets);
    if (at.x !== node.x || at.y !== node.y) moves.set(node.id, at);
  }
  return moves;
}

/**
 * The middle of the part of the page that is on screen, in page
 * coordinates ("Add box" puts the new box there). Both rectangles are in
 * screen coordinates; if none of the page shows, the page's own middle.
 */
export function visibleCenter(page: Bounds, view: Bounds): Point {
  const left = Math.max(page.left, view.left);
  const right = Math.min(page.right, view.right);
  const top = Math.max(page.top, view.top);
  const bottom = Math.min(page.bottom, view.bottom);
  if (left >= right || top >= bottom) {
    return { x: (page.right - page.left) / 2, y: (page.bottom - page.top) / 2 };
  }
  return { x: (left + right) / 2 - page.left, y: (top + bottom) / 2 - page.top };
}

/**
 * `at`, or if a box of `size` there would overlap a box already on the
 * map, the first free spot stepping diagonally down-right -- so "Add box"
 * never hides a new box under an old one (or the old one under it). Gives
 * up and returns `at` if nothing is free within a few dozen steps.
 */
export function freeSpot(
  map: LinkMap,
  sizes: ReadonlyMap<NodeId, Size>,
  at: Point,
  size: Size,
  options: { readonly step: number; readonly fallbackSize: Size; readonly clearance: number },
): Point {
  const overlaps = (p: Point) =>
    Object.values(map.nodes).some((n) => {
      const other = sizes.get(n.id) ?? options.fallbackSize;
      return (
        Math.abs(n.x - p.x) < (size.width + other.width) / 2 + options.clearance &&
        Math.abs(n.y - p.y) < (size.height + other.height) / 2 + options.clearance
      );
    });
  for (let i = 0, spot = at; i < 50; i++, spot = { x: spot.x + options.step, y: spot.y + options.step }) {
    if (!overlaps(spot)) return spot;
  }
  return at;
}
