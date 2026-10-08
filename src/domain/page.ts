import type { Bounds, MapLayout } from "./layout";
import type { LayoutDirection, LinkMap, NodeId, Point, Size } from "./types";

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
 * How far a group of boxes may move by `delta` with every one of them
 * staying on the page: the group moves as one block and stops at the edge
 * as a whole, so its shape never gets squashed against it.
 */
export function clampGroupMove(
  boxes: Iterable<{ readonly center: Point; readonly size: Size }>,
  delta: Point,
  page: Size,
  insets: PageInsets,
): Point {
  let [minX, maxX, minY, maxY] = [-Infinity, Infinity, -Infinity, Infinity];
  for (const { center, size } of boxes) {
    minX = Math.max(minX, size.width / 2 + insets.edge - center.x);
    maxX = Math.min(maxX, page.width - size.width / 2 - insets.edge - center.x);
    minY = Math.max(minY, size.height / 2 + insets.edge - center.y);
    maxY = Math.min(maxY, page.height - size.height / 2 - insets.edge - center.y);
  }
  // As in `clampToPage`: a group too big for the page keeps to its top left.
  const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));
  return { x: clamp(delta.x, minX, maxX), y: clamp(delta.y, minY, maxY) };
}

/**
 * The page's size: the screen, or bigger where the boxes reach further.
 * `except` leaves boxes out: the room a box (or a group being dragged)
 * may use is what the screen and the other boxes make, so a box can't push
 * the page past the screen by itself.
 */
export function pageSize(
  map: LinkMap,
  sizes: ReadonlyMap<NodeId, Size>,
  fallbackSize: Size,
  insets: PageInsets,
  screen: Size,
  except?: NodeId | ReadonlySet<NodeId>,
): Size {
  let width = screen.width;
  let height = screen.height;
  for (const node of Object.values(map.nodes)) {
    if (node.id === except || (typeof except === "object" && except.has(node.id))) continue;
    const size = sizes.get(node.id) ?? fallbackSize;
    width = Math.max(width, node.x + size.width / 2 + insets.edge);
    height = Math.max(height, node.y + size.height / 2 + insets.edge);
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

/** Start / middle / end of an axis: left-centre-right, or top-middle-bottom
    (Treekit's names). */
export type Align = "start" | "center" | "end";

/** Where the whole map sits on the screen, on each axis. */
export interface PageAlign {
  readonly x: Align;
  readonly y: Align;
}

export const CENTERED: PageAlign = { x: "center", y: "center" };

/** The outer edges of all the boxes, where they are now. */
export function boxBounds(map: LinkMap, sizes: ReadonlyMap<NodeId, Size>, fallbackSize: Size): Bounds {
  const nodes = Object.values(map.nodes);
  if (nodes.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of nodes) {
    const size = sizes.get(node.id) ?? fallbackSize;
    left = Math.min(left, node.x - size.width / 2);
    right = Math.max(right, node.x + size.width / 2);
    top = Math.min(top, node.y - size.height / 2);
    bottom = Math.max(bottom, node.y + size.height / 2);
  }
  return { left, top, right, bottom };
}

/**
 * Puts a group of boxes (a finished layout, or the whole map as it is) on
 * the screen as one block: flush to the start, centred, or flush to the end
 * of each axis, `margin` in from the edge. If the block needs more room
 * than the screen has, the page grows to fit it (and then there is no
 * spare room to align in). Like Treekit's placeOnPage.
 */
export function placeOnPage(
  layout: Pick<MapLayout, "positions" | "bounds">,
  screen: Size,
  margin: { readonly x: number; readonly y: number },
  align: PageAlign = CENTERED,
): { positions: Map<NodeId, Point>; page: Size } {
  const b: Bounds = layout.bounds;
  const axis = (lo: number, hi: number, room: number, m: number, a: Align) => {
    const page = Math.max(room, Math.ceil(hi - lo + 2 * m));
    const free = page - (hi - lo) - 2 * m;
    return { page, shift: m + (a === "start" ? 0 : a === "center" ? free / 2 : free) - lo };
  };
  const x = axis(b.left, b.right, screen.width, margin.x, align.x);
  const y = axis(b.top, b.bottom, screen.height, margin.y, align.y);
  const positions = new Map<NodeId, Point>();
  for (const [id, p] of layout.positions) positions.set(id, { x: p.x + x.shift, y: p.y + y.shift });
  return { positions, page: { width: x.page, height: y.page } };
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
 * screen coordinates, `page` as drawn at `zoom`; if none of the page
 * shows, the page's own middle.
 */
export function visibleCenter(page: Bounds, view: Bounds, zoom = 1): Point {
  const left = Math.max(page.left, view.left);
  const right = Math.min(page.right, view.right);
  const top = Math.max(page.top, view.top);
  const bottom = Math.min(page.bottom, view.bottom);
  if (left >= right || top >= bottom) {
    return { x: (page.right - page.left) / 2 / zoom, y: (page.bottom - page.top) / 2 / zoom };
  }
  return { x: ((left + right) / 2 - page.left) / zoom, y: ((top + bottom) / 2 - page.top) / zoom };
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

/**
 * A laid-out block of new boxes (`block`, e.g. an outline just pasted)
 * moved into free space beside `anchor`, the box they came from, without
 * moving anything else: where the map grows (`direction`), so the arrows
 * from the box run straight into the block: below it, centred, top-down;
 * to its right, middles level, left-right. Else the other side. Each side
 * steps further out until the block, kept `clearance` clear, overlaps no
 * box in `others`. Gives up after a few dozen steps and uses the first
 * spot.
 */
export function placeBlockBeside(
  block: MapLayout,
  anchor: { readonly center: Point; readonly size: Size },
  others: Iterable<{ readonly center: Point; readonly size: Size }>,
  options: { readonly gap: number; readonly step: number; readonly clearance: number },
  direction: LayoutDirection = "TB",
): Map<NodeId, Point> {
  const b = block.bounds;
  const width = b.right - b.left;
  const height = b.bottom - b.top;
  const boxes = [...others];
  const a = { left: anchor.center.x - anchor.size.width / 2, top: anchor.center.y - anchor.size.height / 2 };
  const free = (left: number, top: number) =>
    boxes.every((o) => {
      const ol = o.center.x - o.size.width / 2;
      const ot = o.center.y - o.size.height / 2;
      const c = options.clearance;
      return left + width + c <= ol || ol + o.size.width + c <= left || top + height + c <= ot || ot + o.size.height + c <= top;
    });
  const right = { left: a.left + anchor.size.width + options.gap, top: anchor.center.y - height / 2 };
  const below = { left: anchor.center.x - width / 2, top: a.top + anchor.size.height + options.gap };
  const [first, second] = direction === "TB" ? [below, right] : [right, below];
  const out = (s: typeof first, i: number) =>
    s === below ? { left: s.left, top: s.top + i * options.step } : { left: s.left + i * options.step, top: s.top };
  let spot = first;
  search: for (let i = 0; i < 60; i++) {
    for (const s of [out(first, i), out(second, i)]) {
      if (free(s.left, s.top)) {
        spot = s;
        break search;
      }
    }
  }
  const dx = spot.left - b.left;
  const dy = spot.top - b.top;
  return new Map([...block.positions].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]));
}
