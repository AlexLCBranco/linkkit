import type { Bounds, MapLayout } from "./layout";
import type { LinkMap, NodeId, Point, Size } from "./types";

/**
 * The page: a fixed-size sheet the boxes live on. The camera never moves;
 * a bigger page just makes the browser scroll. Boxes always stay fully
 * inside it, which these functions enforce.
 *
 * All the numbers (gutters, minimums) come in as options, so the visual
 * constants live with the UI, not here.
 */

export interface PageInsets {
  /** Space kept clear between any box and the page's left, top and right
      edges. */
  readonly edge: number;
  /** Extra space kept clear at the bottom (room for the "More room" tab). */
  readonly bottomExtra: number;
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
    y: clamp(center.y, hh + insets.edge, page.height - hh - insets.edge - insets.bottomExtra),
  };
}

/**
 * The smallest the page may be dragged to: it can shrink up to the boxes
 * but never cut one off, and never below `floor`.
 */
export function minPageSize(
  map: LinkMap,
  sizes: ReadonlyMap<NodeId, Size>,
  fallbackSize: Size,
  insets: PageInsets,
  floor: Size,
): Size {
  let width = floor.width;
  let height = floor.height;
  for (const node of Object.values(map.nodes)) {
    const size = sizes.get(node.id) ?? fallbackSize;
    width = Math.max(width, node.x + size.width / 2 + insets.edge);
    height = Math.max(height, node.y + size.height / 2 + insets.edge + insets.bottomExtra);
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

/**
 * Puts a finished layout on the page: grows the page if the layout needs
 * more room (never shrinks it -- the owner sized it on purpose), then
 * centres the layout on it. `margin` is the clear space wanted around the
 * whole layout on each side.
 */
export function placeOnPage(
  layout: MapLayout,
  page: Size,
  margin: { readonly x: number; readonly y: number },
): { positions: Map<NodeId, Point>; page: Size } {
  const b: Bounds = layout.bounds;
  const needW = b.right - b.left + 2 * margin.x;
  const needH = b.bottom - b.top + 2 * margin.y;
  const next: Size = {
    width: Math.max(page.width, Math.ceil(needW)),
    height: Math.max(page.height, Math.ceil(needH)),
  };
  const dx = next.width / 2 - (b.left + b.right) / 2;
  const dy = next.height / 2 - (b.top + b.bottom) / 2;
  const positions = new Map<NodeId, Point>();
  for (const [id, p] of layout.positions) positions.set(id, { x: p.x + dx, y: p.y + dy });
  return { positions, page: next };
}
