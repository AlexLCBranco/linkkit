import type { Box } from "./geometry";
import type { LayoutDirection, NodeId, Point } from "./types";

/**
 * Where a box dragged in a tree would land between siblings: the gaps in a
 * row of next steps, and just before the first or after the last. Letting
 * go there makes the dragged box a next step of that row's parent, at that
 * spot (see `moveToParent`). Pure geometry: which rows to offer (the rules,
 * what shows) is the caller's business.
 *
 * Worked out top-down; a left-right tree is the same with x and y swapped.
 */

/** One parent's next steps as they show, in order. */
export interface SiblingRow {
  readonly parent: NodeId;
  readonly siblings: readonly { readonly id: NodeId; readonly box: Box }[];
}

export interface DropSlot {
  readonly parent: NodeId;
  /** The sibling the dropped box goes just before; `null`: last. */
  readonly before: NodeId | null;
  /** The bar drawn in the gap, in page pixels. */
  readonly bar: { readonly from: Point; readonly to: Point };
}

export interface SlotOptions {
  /** How far past the first or last sibling a slot reaches. */
  readonly reach: number;
  /** The narrowest a gap's slot gets, when two siblings almost touch. */
  readonly minGap: number;
}

const swap = (p: Point): Point => ({ x: p.y, y: p.x });
const swapBox = (b: Box): Box => ({ center: swap(b.center), size: { width: b.size.height, height: b.size.width } });

interface Edges {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const edges = ({ center, size }: Box): Edges => ({
  left: center.x - size.width / 2,
  right: center.x + size.width / 2,
  top: center.y - size.height / 2,
  bottom: center.y + size.height / 2,
});

/** The slot under `point`, or `null`. Where slots of two rows overlap (the
    last step of one parent beside the first of the next), the nearer bar
    wins. */
export function dropSlotAt(
  point: Point,
  rows: readonly SiblingRow[],
  direction: LayoutDirection,
  options: SlotOptions,
): DropSlot | null {
  const flip = direction === "LR";
  const p = flip ? swap(point) : point;
  let best: { slot: DropSlot; distance: number } | null = null;

  const offer = (parent: NodeId, before: NodeId | null, lo: number, hi: number, top: number, bottom: number, x: number) => {
    if (p.x < lo || p.x > hi || p.y < top || p.y > bottom) return;
    const distance = Math.abs(p.x - x);
    if (best && best.distance <= distance) return;
    const from = { x, y: top };
    const to = { x, y: bottom };
    best = { slot: { parent, before, bar: flip ? { from: swap(from), to: swap(to) } : { from, to } }, distance };
  };

  for (const { parent, siblings } of rows) {
    if (siblings.length === 0) continue;
    const boxes = siblings.map((s) => edges(flip ? swapBox(s.box) : s.box));
    const first = boxes[0];
    const last = boxes[boxes.length - 1];
    const half = options.minGap / 2;
    offer(parent, siblings[0].id, first.left - options.reach, first.left, first.top, first.bottom, first.left - half);
    offer(parent, null, last.right, last.right + options.reach, last.top, last.bottom, last.right + half);
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1];
      const b = boxes[i];
      // Placed by hand out of order: no gap to aim at between these two.
      if (a.left + a.right >= b.left + b.right) continue;
      const mid = (a.right + b.left) / 2;
      const reach = Math.max((b.left - a.right) / 2, half);
      offer(parent, siblings[i].id, mid - reach, mid + reach, Math.min(a.top, b.top), Math.max(a.bottom, b.bottom), mid);
    }
  }
  return best === null ? null : (best as { slot: DropSlot }).slot;
}
