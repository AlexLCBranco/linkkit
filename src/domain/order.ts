import type { LayoutDirection, LinkMap, NodeId, SiblingOrder } from "./types";

/**
 * Sibling order: each tree box keeps its next steps in an order of its own
 * (Treekit's `childEdges`), left to right top-down, top to bottom
 * left-right. Tidy up follows it, so a tree doesn't reshuffle when it grows.
 * It is also what Boardkit's column and card order will map onto when the
 * apps share a store: a start box's next steps are the lists, a list's next
 * steps its cards.
 *
 * Only trees store one; a connections map's order is whatever Tidy up
 * computes, and its `order` stays empty.
 *
 * Stored as box ids per parent (not arrow ids), like Boardkit's `cardOrder`.
 * The arrows stay the truth about who leads to whom: `nextSteps` reads the
 * stored order but only trusts it for boxes an arrow really leads to, so a
 * stale entry can never put a box somewhere it isn't.
 */

export const isOrdered = (map: LinkMap): boolean => map.kind === "tree";

/** The boxes `id` leads to, in creation order of their arrows. */
function children(map: LinkMap, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  for (const link of Object.values(map.links)) {
    if (link.from === id && map.nodes[link.to] && !out.includes(link.to)) out.push(link.to);
  }
  return out;
}

/** `id`'s next steps in order: the stored order first (only boxes an arrow
    really leads to), then any it doesn't list yet, in arrow creation
    order. */
export function nextSteps(map: LinkMap, id: NodeId): NodeId[] {
  const real = children(map, id);
  const listed = (map.order[id] ?? []).filter((c, i, all) => real.includes(c) && all.indexOf(c) === i);
  return [...listed, ...real.filter((c) => !listed.includes(c))];
}

/** `order` with `child` added as `parent`'s last next step. */
export function withNextStep(order: SiblingOrder, parent: NodeId, child: NodeId): SiblingOrder {
  const list = order[parent] ?? [];
  return list.includes(child) ? order : { ...order, [parent]: [...list, child] };
}

/** `order` without `child` among `parent`'s next steps. */
export function withoutNextStep(order: SiblingOrder, parent: NodeId, child: NodeId): SiblingOrder {
  const list = order[parent];
  if (!list?.includes(child)) return order;
  const rest = list.filter((c) => c !== child);
  const next = { ...order };
  if (rest.length) next[parent] = rest;
  else delete next[parent];
  return next;
}

/** `order` with every trace of the `gone` boxes removed: their own lists,
    and their places in others'. */
export function withoutBoxes(order: SiblingOrder, gone: ReadonlySet<NodeId>): SiblingOrder {
  let changed = false;
  const next: Record<NodeId, readonly NodeId[]> = {};
  for (const [parent, list] of Object.entries(order) as [NodeId, readonly NodeId[]][]) {
    if (gone.has(parent)) {
      changed = true;
      continue;
    }
    const rest = list.filter((c) => !gone.has(c));
    if (rest.length !== list.length) changed = true;
    if (rest.length) next[parent] = rest;
  }
  return changed ? next : order;
}

/**
 * A full, clean order for a tree: every box's next steps, listed as
 * `nextSteps` reads them. With `byPosition`, boxes the stored order doesn't
 * list are placed where they sit on the page instead (left to right, or top
 * to bottom in a left-right tree): how a tree saved before sibling order
 * existed keeps the order it shows.
 */
export function normalizeOrder(map: LinkMap, byPosition?: LayoutDirection): SiblingOrder {
  const order: Record<NodeId, readonly NodeId[]> = {};
  const across = (id: NodeId) => (byPosition === "LR" ? map.nodes[id].y : map.nodes[id].x);
  for (const id of Object.keys(map.nodes) as NodeId[]) {
    let list = nextSteps(map, id);
    if (byPosition) {
      const listed = (map.order[id] ?? []).filter((c) => list.includes(c));
      const unlisted = list.filter((c) => !listed.includes(c)).sort((a, b) => across(a) - across(b));
      list = [...listed, ...unlisted];
    }
    if (list.length) order[id] = list;
  }
  return order;
}

/** True when two orders list the same next steps in the same order. */
export function sameOrder(a: SiblingOrder, b: SiblingOrder): boolean {
  const keys = Object.keys(a) as NodeId[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    return !!y && x.length === y.length && x.every((c, i) => c === y[i]);
  });
}
