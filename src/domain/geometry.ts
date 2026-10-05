import type { Point, Size } from "./types";

/**
 * Where an arrow is drawn. Arrows are straight lines from box to box, as in
 * the prototype: they leave a box's border on the side facing the other box
 * and stop just short of the other box's border, where the arrowhead sits.
 *
 * The arrowhead is a triangle drawn here rather than an SVG `<marker>`: the
 * line stops at the head's base, so a see-through line colour never shows
 * a darker stripe where line and head overlap, and the head can be coloured
 * by CSS like any other shape (needed for the needs / breaks highlight).
 */

export interface Box {
  /** The box's centre, as stored on the map. */
  readonly center: Point;
  readonly size: Size;
}

export interface ArrowOptions {
  /** Clear space between a box's border and the end of a line. */
  readonly gap: number;
  /** From the arrowhead's tip back to its base. */
  readonly headLength: number;
  readonly headWidth: number;
}

export interface LinkGeometry {
  /** Where the line leaves the `from` box. */
  readonly start: Point;
  /** Where the line stops: the arrowhead's base. */
  readonly end: Point;
  /** The arrowhead: tip, then the two back corners. */
  readonly head: readonly [Point, Point, Point];
  /** The middle of the arrow, start to tip: where its label goes. */
  readonly middle: Point;
}

/**
 * Where a ray from the box's centre toward `toward` crosses the box's
 * border pushed out by `gap`. `null` when `toward` is the centre itself
 * (there is no direction to go).
 */
export function borderPoint(box: Box, toward: Point, gap: number): Point | null {
  const dx = toward.x - box.center.x;
  const dy = toward.y - box.center.y;
  if (dx === 0 && dy === 0) return null;
  const halfW = box.size.width / 2 + gap;
  const halfH = box.size.height / 2 + gap;
  // How far along the ray each pair of sides is; the nearer one is hit first.
  const t = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
  return { x: box.center.x + dx * t, y: box.center.y + dy * t };
}

/**
 * The arrow from one box to another, or `null` when there is no room to
 * draw one: the boxes overlap (or nearly touch), so the line would run
 * backwards or be shorter than its own head.
 */
export function linkGeometry(from: Box, to: Box, options: ArrowOptions): LinkGeometry | null {
  const start = borderPoint(from, to.center, options.gap);
  const tip = borderPoint(to, from.center, options.gap);
  if (!start || !tip) return null;

  const dx = tip.x - start.x;
  const dy = tip.y - start.y;
  const length = Math.hypot(dx, dy);
  // Pointing the opposite way from centre-to-centre means the two borders
  // have crossed: the boxes overlap.
  const forward = dx * (to.center.x - from.center.x) + dy * (to.center.y - from.center.y) > 0;
  if (!forward || length <= options.headLength) return null;

  const ux = dx / length;
  const uy = dy / length;
  const end = { x: tip.x - ux * options.headLength, y: tip.y - uy * options.headLength };
  const half = options.headWidth / 2;
  const head: [Point, Point, Point] = [
    tip,
    { x: end.x - uy * half, y: end.y + ux * half },
    { x: end.x + uy * half, y: end.y - ux * half },
  ];
  return { start, end, head, middle: { x: (start.x + tip.x) / 2, y: (start.y + tip.y) / 2 } };
}
