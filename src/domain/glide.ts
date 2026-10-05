import type { NodeId, Point } from "./types";

/**
 * The maths of a glide (Tidy up moving boxes to their new places): how far
 * along the way each box is at a moment `t` from 0 (start) to 1 (arrived).
 * The timing itself (animation frames, reduced motion) is the UI's job.
 */

/** Starts fast and settles gently, as Treekit's glides do. */
export const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/**
 * Every box in `to` at the eased point `t` of the way from `from`. A box
 * with no starting point is already where it is going.
 */
export function glidePositions(
  from: ReadonlyMap<NodeId, Point>,
  to: ReadonlyMap<NodeId, Point>,
  t: number,
): Map<NodeId, Point> {
  const k = easeOut(t);
  const out = new Map<NodeId, Point>();
  for (const [id, b] of to) {
    const a = from.get(id) ?? b;
    out.set(id, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  }
  return out;
}
