import type { LinkId, LinkMap, NodeId } from "./types";

/* Small graph walks shared by `status.ts`, `shown.ts` and the layouts. */

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

/**
 * Which arrows to set aside so no loop is left. A depth-first walk that
 * starts from the boxes nothing needs (the natural tops), then from any box
 * still unvisited, in creation order; an arrow back to a box still on the
 * walk's path closes a loop and is set aside.
 */
export function loopBreakingLinks(map: LinkMap): Set<LinkId> {
  const ids = Object.keys(map.nodes) as NodeId[];
  const out = new Map<NodeId, { link: LinkId; to: NodeId }[]>(ids.map((id) => [id, []]));
  const hasIncoming = new Set<NodeId>();
  for (const link of Object.values(map.links)) {
    if (!map.nodes[link.from] || !map.nodes[link.to]) continue;
    out.get(link.from)!.push({ link: link.id, to: link.to });
    hasIncoming.add(link.to);
  }

  const broken = new Set<LinkId>();
  const state = new Map<NodeId, "onPath" | "done">();
  const starts = [...ids.filter((id) => !hasIncoming.has(id)), ...ids];
  for (const start of starts) {
    if (state.has(start)) continue;
    // Iterative, so a long chain cannot overflow the call stack.
    const stack: { id: NodeId; next: number }[] = [{ id: start, next: 0 }];
    state.set(start, "onPath");
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const edges = out.get(top.id)!;
      if (top.next === edges.length) {
        state.set(top.id, "done");
        stack.pop();
        continue;
      }
      const { link, to } = edges[top.next++];
      const seen = state.get(to);
      if (seen === "onPath") broken.add(link);
      else if (seen === undefined) {
        state.set(to, "onPath");
        stack.push({ id: to, next: 0 });
      }
    }
  }
  return broken;
}

/** Row number of every box, 0 at the top, with loops broken first. */
export function layerNodes(map: LinkMap, loopLinks: ReadonlySet<LinkId> = loopBreakingLinks(map)): Map<NodeId, number> {
  const ids = Object.keys(map.nodes) as NodeId[];
  const out = new Map<NodeId, NodeId[]>(ids.map((id) => [id, []]));
  const waiting = new Map<NodeId, number>(ids.map((id) => [id, 0]));
  for (const link of Object.values(map.links)) {
    if (loopLinks.has(link.id) || !map.nodes[link.from] || !map.nodes[link.to]) continue;
    out.get(link.from)!.push(link.to);
    waiting.set(link.to, waiting.get(link.to)! + 1);
  }
  // Kahn's topological order: a box is placed once everything that needs it is.
  const layer = new Map<NodeId, number>(ids.map((id) => [id, 0]));
  const ready = ids.filter((id) => waiting.get(id) === 0);
  for (let i = 0; i < ready.length; i++) {
    const id = ready[i];
    for (const to of out.get(id)!) {
      layer.set(to, Math.max(layer.get(to)!, layer.get(id)! + 1));
      const left = waiting.get(to)! - 1;
      waiting.set(to, left);
      if (left === 0) ready.push(to);
    }
  }
  return layer;
}
