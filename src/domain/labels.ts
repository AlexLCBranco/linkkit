import type { Box } from "./geometry";
import type { Point, Size } from "./types";

/**
 * Where each arrow's label sits. The middle of the arrow by default, as in
 * the prototype; but arrows that cross (Outlook -> sign-in and Teams ->
 * license in the example) have their middles close together, and their
 * labels would pile up into an unreadable stack. So each label, in turn,
 * slides along its own arrow to the first spot that overlaps no box and no
 * label already placed. If none is free it takes the least crowded spot;
 * it never leaves its arrow.
 */

export interface LabelRequest<K> {
  readonly id: K;
  /** The arrow's visible stretch, from where it leaves its box to its tip. */
  readonly start: Point;
  readonly tip: Point;
  readonly size: Size;
}

export interface LabelOptions {
  /** Spots to try, as fractions along the arrow (0 = start, 1 = tip), in
      order of preference. */
  readonly spots: readonly number[];
  /** Clear space wanted around a label. */
  readonly padding: number;
}

/** How much two boxes (each grown by `padding`) overlap, as an area. */
function overlap(a: Box, b: Box, padding: number): number {
  const span = (ca: number, sa: number, cb: number, sb: number) =>
    Math.min(ca + sa / 2, cb + sb / 2 + padding) - Math.max(ca - sa / 2, cb - sb / 2 - padding);
  const w = span(a.center.x, a.size.width, b.center.x, b.size.width);
  const h = span(a.center.y, a.size.height, b.center.y, b.size.height);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Each label's centre. Requests are placed in the order given, so the
    result is deterministic. */
export function placeLabels<K>(
  requests: readonly LabelRequest<K>[],
  boxes: readonly Box[],
  options: LabelOptions,
): Map<K, Point> {
  const placed: Box[] = [];
  const out = new Map<K, Point>();
  for (const { id, start, tip, size } of requests) {
    const at = (t: number): Point => ({ x: start.x + (tip.x - start.x) * t, y: start.y + (tip.y - start.y) * t });
    const crowding = (center: Point) =>
      [...boxes, ...placed].reduce((sum, other) => sum + overlap({ center, size }, other, options.padding), 0);
    // The first free spot; failing that, the least crowded (ties keep the
    // earlier, more central one).
    let spot = at(options.spots[0] ?? 0.5);
    let least = crowding(spot);
    for (const t of options.spots.slice(1)) {
      if (least === 0) break;
      const candidate = at(t);
      const c = crowding(candidate);
      if (c < least) [spot, least] = [candidate, c];
    }
    placed.push({ center: spot, size });
    out.set(id, spot);
  }
  return out;
}
