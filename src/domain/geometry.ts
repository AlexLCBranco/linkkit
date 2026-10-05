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
  return exitPoint(box, box.center, { x: toward.x - box.center.x, y: toward.y - box.center.y }, gap);
}

/**
 * Where a ray from `origin` (inside the box) going along `dir` crosses the
 * box's border pushed out by `gap`. `null` when `dir` is zero.
 */
function exitPoint(box: Box, origin: Point, dir: Point, gap: number): Point | null {
  if (dir.x === 0 && dir.y === 0) return null;
  // How far along the ray the side it heads for is, on each axis; the
  // nearer one is hit first.
  const along = (d: number, from: number, centre: number, half: number) =>
    d === 0 ? Infinity : (centre + Math.sign(d) * (half + gap) - from) / d;
  const t = Math.min(
    along(dir.x, origin.x, box.center.x, box.size.width / 2),
    along(dir.y, origin.y, box.center.y, box.size.height / 2),
  );
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t };
}

/**
 * The arrow from one box to another, or `null` when there is no room to
 * draw one: the boxes overlap (or nearly touch), so the line would run
 * backwards or be shorter than its own head.
 *
 * `offset` slides the whole arrow sideways, to its own right as it
 * travels, parallel to the centre-to-centre line. Two arrows between the
 * same boxes in opposite directions each slide to their own right, so they
 * sit side by side instead of on top of each other.
 */
export function linkGeometry(from: Box, to: Box, options: ArrowOptions, offset = 0): LinkGeometry | null {
  const cx = to.center.x - from.center.x;
  const cy = to.center.y - from.center.y;
  const distance = Math.hypot(cx, cy);
  if (distance === 0) return null;
  // "Right" of the direction of travel, on screen (y points down).
  const sx = (-cy / distance) * offset;
  const sy = (cx / distance) * offset;
  const start = exitPoint(from, { x: from.center.x + sx, y: from.center.y + sy }, { x: cx, y: cy }, options.gap);
  const tip = exitPoint(to, { x: to.center.x + sx, y: to.center.y + sy }, { x: -cx, y: -cy }, options.gap);
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
