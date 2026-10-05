import type { NodeId, Point, Size } from "./types";

/**
 * What the marquee (the box dragged out on empty paper) picks. Pure
 * geometry in page pixels, so it can be tested without React Flow. Like
 * Treekit's: a box is picked when the marquee holds ALL of it, so brushing
 * past the edge of a box doesn't pick it.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The rectangle between two corners, whichever way it was dragged. */
export function rectBetween(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Whether `outer` holds all of a box centred on `center` (touching edges
    count). */
export function holds(outer: Rect, center: Point, size: Size): boolean {
  return (
    center.x - size.width / 2 >= outer.x &&
    center.y - size.height / 2 >= outer.y &&
    center.x + size.width / 2 <= outer.x + outer.width &&
    center.y + size.height / 2 <= outer.y + outer.height
  );
}

/** Every box the marquee holds, in the order given. */
export function boxesIn(rect: Rect, boxes: Iterable<readonly [NodeId, { center: Point; size: Size }]>): NodeId[] {
  const picked: NodeId[] = [];
  for (const [id, box] of boxes) if (holds(rect, box.center, box.size)) picked.push(id);
  return picked;
}

/**
 * The selection after the marquee moved. A plain drag picks just what it
 * holds; with Shift held it adds to what was already picked (`before`),
 * which keeps its order, the new ones after it.
 */
export function marqueeSelection(before: readonly NodeId[], picked: readonly NodeId[], adding: boolean): NodeId[] {
  if (!adding) return [...picked];
  return [...before, ...picked.filter((id) => !before.includes(id))];
}
