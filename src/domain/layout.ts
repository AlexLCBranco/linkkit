import type { LinkId, LinkMap, NodeId, Point, Size } from "./types";

/**
 * Tidy up: turns a map plus each box's measured size into box centres. This
 * is the only file that knows how placement works, so swapping in another
 * algorithm (or a library, one day) touches nothing else.
 *
 * A small layered layout, hand-written rather than dagre/elk (a whole
 * graph-layout library for a dozen boxes is a lot of weight, and CLAUDE.md
 * asks before adding one). Arrows point down: a box sits above what it
 * needs.
 *
 *  1. Break loops. A loop has no "top", so one arrow of each loop is set
 *     aside for layering (it is still drawn; it just points upward). The
 *     prototype skipped this step and kept pushing loop members down until
 *     a give-up limit, which left tall empty rows -- this avoids that.
 *  2. Layer: each box goes one row below the lowest box that needs it
 *     (longest path), so every arrow that was kept points downward and no
 *     row is ever empty.
 *  3. Order each row by the average x of the boxes above that need it, so
 *     arrows run as straight as cheaply possible. Ties keep creation order,
 *     which makes the result deterministic.
 *  4. Centre every row on x = 0; rows stack from y = 0 downward.
 */

export interface LayoutOptions {
  /** Gap between neighbouring boxes in a row. */
  readonly columnGap: number;
  /** Gap between the bottom of one row's tallest box and the next row. */
  readonly rowGap: number;
  /** Used for a box that has not been measured yet. */
  readonly fallbackSize: Size;
}

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface MapLayout {
  /** Box centres, around x = 0, from y = 0 down. */
  readonly positions: ReadonlyMap<NodeId, Point>;
  /** The outer edges of all boxes (not just their centres). */
  readonly bounds: Bounds;
  /** The arrows set aside to break loops; they point upward. */
  readonly loopLinks: ReadonlySet<LinkId>;
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

export function layoutMap(map: LinkMap, sizes: ReadonlyMap<NodeId, Size>, options: LayoutOptions): MapLayout {
  const { columnGap, rowGap, fallbackSize } = options;
  const sizeOf = (id: NodeId) => sizes.get(id) ?? fallbackSize;
  const loopLinks = loopBreakingLinks(map);
  const layer = layerNodes(map, loopLinks);

  const rows: NodeId[][] = [];
  for (const id of Object.keys(map.nodes) as NodeId[]) (rows[layer.get(id)!] ??= []).push(id);

  const parents = new Map<NodeId, NodeId[]>();
  for (const link of Object.values(map.links)) {
    if (loopLinks.has(link.id) || !map.nodes[link.from] || !map.nodes[link.to]) continue;
    parents.set(link.to, [...(parents.get(link.to) ?? []), link.from]);
  }

  const positions = new Map<NodeId, Point>();
  let left = Infinity;
  let right = -Infinity;
  let y = 0;
  for (const [r, row] of rows.entries()) {
    if (r > 0) {
      const key = new Map<NodeId, number>();
      for (const id of row) {
        const xs = (parents.get(id) ?? []).map((p) => positions.get(p)?.x).filter((x) => x !== undefined);
        key.set(id, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
      }
      row.sort((a, b) => key.get(a)! - key.get(b)!);
    }
    const width = row.reduce((sum, id) => sum + sizeOf(id).width, 0) + columnGap * (row.length - 1);
    const height = Math.max(...row.map((id) => sizeOf(id).height));
    let x = -width / 2;
    for (const id of row) {
      const w = sizeOf(id).width;
      positions.set(id, { x: x + w / 2, y: y + height / 2 });
      x += w + columnGap;
    }
    left = Math.min(left, -width / 2);
    right = Math.max(right, width / 2);
    y += height + rowGap;
  }

  const bounds = rows.length ? { left, top: 0, right, bottom: y - rowGap } : { left: 0, top: 0, right: 0, bottom: 0 };
  return { positions, bounds, loopLinks };
}
