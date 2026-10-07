import type { LinkMap, NodeId } from "./types";

/* Small graph walks shared by `status.ts` and `shown.ts`. */

/** Each box's ways in, and the boxes in an order where every box comes
    after all its parents (Kahn's). Boxes on a loop (only in a damaged
    tree) never come up, and are left out of `order`. */
export function parentsFirst(map: LinkMap): { order: NodeId[]; parents: Map<NodeId, NodeId[]> } {
  const parents = new Map<NodeId, NodeId[]>();
  const children = new Map<NodeId, NodeId[]>();
  for (const { from, to } of Object.values(map.links)) {
    if (!map.nodes[from] || !map.nodes[to]) continue;
    parents.set(to, [...(parents.get(to) ?? []), from]);
    children.set(from, [...(children.get(from) ?? []), to]);
  }
  const waiting = new Map<NodeId, number>();
  const order: NodeId[] = [];
  for (const id of Object.keys(map.nodes) as NodeId[]) {
    const n = parents.get(id)?.length ?? 0;
    waiting.set(id, n);
    if (n === 0) order.push(id);
  }
  for (let i = 0; i < order.length; i++) {
    for (const c of children.get(order[i]) ?? []) {
      const left = waiting.get(c)! - 1;
      waiting.set(c, left);
      if (left === 0) order.push(c);
    }
  }
  return { order, parents };
}
