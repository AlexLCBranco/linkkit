import { layerNodes, loopBreakingLinks } from "./graph";
import type { LayoutOptions, MapLayout } from "./layout";
import { nextSteps } from "./order";
import { rowMiddle, rowsDown } from "./rows";
import { branchStarts, pathKey, splits, stepPlaces } from "./steps";
import type { LinkId, LinkMap, NodeId, Point, Size } from "./types";

/**
 * A Steps map's Tidy up (owner's spec: top to bottom, branches side by
 * side, joins centred under their branches). It follows the same paths
 * the numbers do (`stepPlaces` in steps.ts), so what looks like one branch
 * is numbered as one:
 *
 *  1. Rows, as a tree's: a step goes one row below its lowest parent, so
 *     a join sits under the longest of the branches it joins, and each
 *     row's gap grows by the tallest label on the arrows into it.
 *  2. Each path (the main path, or one branch) is one straight column:
 *     every step on it shares its centre line, so the process reads
 *     straight down and a join lands back on the line its split left.
 *  3. A split's branches stand side by side under it, `columnGap` apart,
 *     in sibling order, each as wide as its widest step (or the label on
 *     the arrow into it); the split, and so its join, is centred over
 *     them.
 *  4. An arrow straight from a split into its join ("No: go straight
 *     on") keeps a lane as wide as the join among the branches, and the
 *     split and join sit on that lane, so the line runs straight down
 *     with the branches beside it, never through them.
 *
 * A last pass keeps any two boxes in one row at least `columnGap` apart,
 * for shapes the columns don't foresee (a branch that runs on past a
 * join, steps not reached from the start in damaged data). Centred on
 * x = 0, from y = 0 down, like the other layouts.
 */

/** How far a block reaches either side of its centre line. */
interface Span {
  readonly left: number;
  readonly right: number;
}

/** A laid-out part of the map, not yet placed: its reach, and how to put
    it down with its centre line at `x`. */
interface Block {
  readonly span: Span;
  readonly place: (x: number) => void;
}

const around = (width: number): Span => ({ left: -width / 2, right: width / 2 });
const union = (a: Span, b: Span): Span => ({ left: Math.min(a.left, b.left), right: Math.max(a.right, b.right) });

export function layoutSteps(map: LinkMap, sizes: ReadonlyMap<NodeId, Size>, options: LayoutOptions): MapLayout {
  const { columnGap, rowGap, fallbackSize } = options;
  const labelSizes = options.labelSizes ?? new Map<LinkId, Size>();
  const sizeOf = (id: NodeId) => sizes.get(id) ?? fallbackSize;
  const ids = Object.keys(map.nodes) as NodeId[];
  const loopLinks = loopBreakingLinks(map);
  const row = layerNodes(map, loopLinks);
  const kept = Object.values(map.links).filter((l) => !loopLinks.has(l.id) && map.nodes[l.from] && map.nodes[l.to]);
  const rows = rowsDown(ids, row, kept, sizeOf, rowGap, labelSizes);

  // Each path's steps, in order along it.
  const places = stepPlaces(map);
  const keyOf = (id: NodeId) => pathKey(places.get(id)!.frames);
  const paths = new Map<string, NodeId[]>();
  for (const [id, place] of places) {
    const key = pathKey(place.frames);
    paths.set(key, [...(paths.get(key) ?? []), id]);
  }
  for (const steps of paths.values()) steps.sort((a, b) => places.get(a)!.index - places.get(b)!.index);

  const labelWidth = (from: NodeId, to: NodeId): number => {
    const link = kept.find((l) => l.from === from && l.to === to);
    return link?.label ? (labelSizes.get(link.id)?.width ?? 0) : 0;
  };

  const x = new Map<NodeId, number>();

  /** Blocks left to right, `columnGap` apart. The centre line is the
      middle of the whole row, or block `spine`'s own centre line. */
  const sideBySide = (blocks: readonly Block[], spine = -1): Block => {
    const lines: number[] = [];
    let cursor = 0;
    for (const b of blocks) {
      lines.push(cursor - b.span.left);
      cursor += b.span.right - b.span.left + columnGap;
    }
    const width = cursor - columnGap;
    const centre = spine === -1 ? width / 2 : lines[spine];
    return {
      span: { left: -centre, right: width - centre },
      place: (at) => blocks.forEach((b, i) => b.place(at - centre + lines[i])),
    };
  };

  /** One step, with its branches under it when it splits. */
  const stepBlock = (id: NodeId): Block => {
    const own = around(sizeOf(id).width);
    if (!splits(map, id)) return { span: own, place: (at) => x.set(id, at) };
    const starts = new Set(branchStarts(map, id));
    const parts: Block[] = [];
    let lane = -1;
    for (const c of nextSteps(map, id)) {
      if (!places.has(c)) continue;
      const label = around(labelWidth(id, c));
      if (starts.has(c)) {
        const branch = pathBlock(keyOf(c));
        parts.push({ ...branch, span: union(branch.span, label) });
      } else if (lane === -1 && keyOf(c) === keyOf(id)) {
        // Straight on into the join: a lane the join's width.
        lane = parts.length;
        parts.push({ span: union(around(sizeOf(c).width), label), place: () => {} });
      }
    }
    if (parts.length === 0) return { span: own, place: (at) => x.set(id, at) };
    const under = sideBySide(parts, lane);
    return {
      span: union(own, under.span),
      place: (at) => {
        x.set(id, at);
        under.place(at);
      },
    };
  };

  /** A whole path down one centre line. Two steps at one place on it
      (only after unusual joins) stand side by side. */
  const pathBlock = (key: string): Block => {
    const steps = paths.get(key) ?? [];
    const blocks: Block[] = [];
    for (let i = 0; i < steps.length; ) {
      const index = places.get(steps[i])!.index;
      const same: Block[] = [];
      for (; i < steps.length && places.get(steps[i])!.index === index; i++) same.push(stepBlock(steps[i]));
      blocks.push(same.length === 1 ? same[0] : sideBySide(same));
    }
    return {
      span: blocks.reduce((s, b) => union(s, b.span), around(0)),
      place: (at) => blocks.forEach((b) => b.place(at)),
    };
  };

  const main = pathBlock("");
  main.place(0);
  // Steps not reached from the start (damaged data): to the right.
  let spare = main.span.right + columnGap;
  for (const id of ids) {
    if (x.has(id)) continue;
    x.set(id, spare + sizeOf(id).width / 2);
    spare += sizeOf(id).width + columnGap;
  }

  // No two boxes in a row closer than `columnGap`.
  const byRow = new Map<number, NodeId[]>();
  for (const id of ids) byRow.set(row.get(id)!, [...(byRow.get(row.get(id)!) ?? []), id]);
  for (const boxes of byRow.values()) {
    boxes.sort((a, b) => x.get(a)! - x.get(b)!);
    for (let i = 1; i < boxes.length; i++) {
      const before = boxes[i - 1];
      const least = x.get(before)! + sizeOf(before).width / 2 + columnGap + sizeOf(boxes[i]).width / 2;
      if (x.get(boxes[i])! < least) x.set(boxes[i], least);
    }
  }

  if (ids.length === 0) return { positions: new Map(), bounds: { left: 0, top: 0, right: 0, bottom: 0 }, loopLinks };
  let left = Infinity;
  let right = -Infinity;
  for (const id of ids) {
    left = Math.min(left, x.get(id)! - sizeOf(id).width / 2);
    right = Math.max(right, x.get(id)! + sizeOf(id).width / 2);
  }
  const shift = (left + right) / 2;
  const positions = new Map<NodeId, Point>(ids.map((id) => [id, { x: x.get(id)! - shift, y: rowMiddle(rows, row.get(id)!) }]));
  return { positions, bounds: { left: left - shift, top: 0, right: right - shift, bottom: rows.total }, loopLinks };
}
