import { isOrdered, nextSteps } from "./order";
import type { LayoutDirection, LinkId, LinkMap, NodeId, Point, Size } from "./types";

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
 *     arrows run as straight as cheaply possible. Ties follow a tree's
 *     sibling order (`order.ts`), then creation order,
 *     which makes the result deterministic.
 *  4. Centre every row on x = 0; rows stack from y = 0 downward.
 *
 * Left-right is the same layout turned on its side: it runs top-down on
 * boxes with width and height swapped, then swaps x and y back, so rows
 * become columns (a box left of what it needs) and every gap keeps its
 * meaning along the arrows ("rowGap") and across them ("columnGap").
 */

export interface LayoutOptions {
  /** Gap between neighbouring boxes in a row. */
  readonly columnGap: number;
  /** Gap between the bottom of one row's tallest box and the next row. */
  readonly rowGap: number;
  /** Used for a box that has not been measured yet. */
  readonly fallbackSize: Size;
  /** A tree's arrow labels (only those with text): each row's gap grows
      by the deepest label on the arrows into it, and a label counts as
      wide as a box beside its neighbours (`layoutTree`). Unused by other
      maps, whose `rowGap` already holds the deepest label. */
  readonly labelSizes?: ReadonlyMap<LinkId, Size>;
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

/**
 * The gap between rows (`rowGap`) for an arrow length. A label sits on its
 * arrow, so the gap is the deepest label along the arrows (its height
 * top-down, its width left-right: labels are wider than tall), plus the
 * arrow's own ends (the space at the boxes and the arrowhead), plus
 * `extra`: the bare arrow the chosen length shows beside the label. So
 * even the shortest arrows never have a label covering a box, in either
 * direction.
 */
export function arrowGap(extra: number, labels: Iterable<Size>, direction: LayoutDirection, ends: number): number {
  let deepest = 0;
  for (const s of labels) deepest = Math.max(deepest, direction === "TB" ? s.height : s.width);
  return deepest + ends + extra;
}

export function layoutMap(
  map: LinkMap,
  sizes: ReadonlyMap<NodeId, Size>,
  options: LayoutOptions,
  direction: LayoutDirection = map.direction,
): MapLayout {
  if (direction === "TB") return layoutTopDown(map, sizes, options);
  const flip = ({ width, height }: Size): Size => ({ width: height, height: width });
  const flipped = new Map([...sizes].map(([id, s]) => [id, flip(s)]));
  const labelSizes = options.labelSizes && new Map([...options.labelSizes].map(([id, s]) => [id, flip(s)]));
  const down = layoutTopDown(map, flipped, { ...options, fallbackSize: flip(options.fallbackSize), labelSizes });
  const b = down.bounds;
  return {
    positions: new Map([...down.positions].map(([id, p]) => [id, { x: p.y, y: p.x }])),
    bounds: { left: b.top, top: b.left, right: b.bottom, bottom: b.right },
    loopLinks: down.loopLinks,
  };
}

function layoutTopDown(map: LinkMap, sizes: ReadonlyMap<NodeId, Size>, options: LayoutOptions): MapLayout {
  return map.kind === "tree" ? layoutTree(map, sizes, options) : layoutLayers(map, sizes, options);
}

function layoutLayers(map: LinkMap, sizes: ReadonlyMap<NodeId, Size>, options: LayoutOptions): MapLayout {
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

  // A tree's sibling order: where each box sits among its parent's next
  // steps (its earliest place, for a box with two parents). It settles
  // ties, so a parent's next steps line up in their stored order.
  const rank = new Map<NodeId, number>();
  if (isOrdered(map)) {
    for (const id of Object.keys(map.nodes) as NodeId[]) {
      for (const [i, child] of nextSteps(map, id).entries()) rank.set(child, Math.min(rank.get(child) ?? i, i));
    }
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
      row.sort((a, b) => key.get(a)! - key.get(b)! || (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
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

/**
 * A tree's Tidy up: Treekit's tidy tree (its `domain/layout.ts`), for a
 * tree whose boxes may have two parents (the owner's rule, 2026-10-08).
 *
 *  1. Rows: a box goes one row below its lowest parent (`layerNodes`), so
 *     every arrow points down the map and every row lines up, as Treekit's
 *     generations do.
 *  2. Home: that lowest parent is the box's home, where it and its branch
 *     are laid out. Two parents in the same row: the one first in reading
 *     order (left top-down, top left-right) is home. The other parent's
 *     arrow just runs across into the box and takes no room.
 *  3. Each branch is as wide as its box (or the label above it) or its
 *     next steps side by side, `columnGap` apart, whichever is wider; the
 *     next steps go in sibling order, their block centred under the box.
 *  4. Row gaps: `rowGap` plus the deepest label on the arrows into the
 *     row (Treekit's "label band"), so a tall label widens only its own
 *     gap. Each box is centred in its row's depth.
 *
 * Several starts (only in a damaged tree) sit side by side, three column
 * gaps apart (Treekit's board of trees). A loop (likewise) has its closing
 * arrow set aside, as in any map.
 */
function layoutTree(map: LinkMap, sizes: ReadonlyMap<NodeId, Size>, options: LayoutOptions): MapLayout {
  const { columnGap, rowGap, fallbackSize } = options;
  const labelSizes = options.labelSizes ?? new Map<LinkId, Size>();
  const sizeOf = (id: NodeId) => sizes.get(id) ?? fallbackSize;
  const ids = Object.keys(map.nodes) as NodeId[];
  const loopLinks = loopBreakingLinks(map);
  const row = layerNodes(map, loopLinks);
  const kept = Object.values(map.links).filter((l) => !loopLinks.has(l.id) && map.nodes[l.from] && map.nodes[l.to]);
  const keptInto = new Set(kept.map((l) => l.to));
  const keptPairs = new Set(kept.map((l) => `${l.from}>${l.to}`));

  // Reading order: a walk from the start(s) through next steps in sibling
  // order. It settles which of two same-row parents is home.
  const roots = ids.filter((id) => !keptInto.has(id));
  const reading = new Map<NodeId, number>();
  const walk = [...roots].reverse();
  while (walk.length > 0) {
    const id = walk.pop()!;
    if (reading.has(id)) continue;
    reading.set(id, reading.size);
    const next = nextSteps(map, id).filter((c) => keptPairs.has(`${id}>${c}`));
    for (let i = next.length - 1; i >= 0; i--) walk.push(next[i]);
  }
  const readingOf = (id: NodeId) => reading.get(id) ?? Infinity;

  const home = new Map<NodeId, { readonly parent: NodeId; readonly link: LinkId }>();
  for (const l of kept) {
    if (row.get(l.from)! !== row.get(l.to)! - 1) continue;
    const now = home.get(l.to);
    if (!now || readingOf(l.from) < readingOf(now.parent)) home.set(l.to, { parent: l.from, link: l.id });
  }
  const childrenOf = (id: NodeId) => nextSteps(map, id).filter((c) => home.get(c)?.parent === id);

  // Row depths, each gap's label band, and where each row starts.
  const rowDepth: number[] = [];
  const band: number[] = [];
  for (const id of ids) {
    const r = row.get(id)!;
    rowDepth[r] = Math.max(rowDepth[r] ?? 0, sizeOf(id).height);
  }
  for (const l of kept) {
    const label = l.label ? labelSizes.get(l.id) : undefined;
    const r = row.get(l.to)!;
    band[r] = Math.max(band[r] ?? 0, label?.height ?? 0);
  }
  const rowStart: number[] = [];
  let depth = 0;
  for (let r = 0; r < rowDepth.length; r++) {
    if (r > 0) depth += rowGap + (band[r] ?? 0);
    rowStart[r] = depth;
    depth += rowDepth[r] ?? 0;
  }

  // Branch widths, bottom-up; then each box centred over its block.
  const slotOf = (id: NodeId) => {
    const h = home.get(id);
    const label = h && map.links[h.link]?.label ? labelSizes.get(h.link) : undefined;
    return Math.max(sizeOf(id).width, label?.width ?? 0);
  };
  const branch = new Map<NodeId, number>();
  const block = new Map<NodeId, number>();
  const measure = (id: NodeId): number => {
    const next = childrenOf(id);
    const b = next.reduce((sum, c) => sum + measure(c), 0) + columnGap * Math.max(0, next.length - 1);
    block.set(id, b);
    const width = Math.max(slotOf(id), b);
    branch.set(id, width);
    return width;
  };
  const positions = new Map<NodeId, Point>();
  const place = (id: NodeId, start: number) => {
    const center = start + branch.get(id)! / 2;
    const r = row.get(id)!;
    positions.set(id, { x: center, y: rowStart[r] + rowDepth[r] / 2 });
    let cursor = center - block.get(id)! / 2;
    for (const c of childrenOf(id)) {
      place(c, cursor);
      cursor += branch.get(c)! + columnGap;
    }
  };
  let cursor = 0;
  for (const id of [...roots].sort((a, b) => readingOf(a) - readingOf(b))) {
    measure(id);
    place(id, cursor);
    cursor += branch.get(id)! + columnGap * 3;
  }
  if (positions.size === 0) return { positions, bounds: { left: 0, top: 0, right: 0, bottom: 0 }, loopLinks };

  // Centred on x = 0, like the other layout.
  let left = Infinity;
  let right = -Infinity;
  for (const [id, p] of positions) {
    left = Math.min(left, p.x - sizeOf(id).width / 2);
    right = Math.max(right, p.x + sizeOf(id).width / 2);
  }
  const shift = (left + right) / 2;
  const centred = new Map([...positions].map(([id, p]) => [id, { x: p.x - shift, y: p.y }]));
  return { positions: centred, bounds: { left: left - shift, top: 0, right: right - shift, bottom: depth }, loopLinks };
}
