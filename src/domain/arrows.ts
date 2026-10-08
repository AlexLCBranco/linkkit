import { linkGeometry, type ArrowOptions, type Box } from "./geometry";
import type { ArrowStyle, LayoutDirection, Link, LinkId, NodeId, Point, Size } from "./types";

/**
 * How each arrow is drawn, in the map's arrow style (`ArrowStyle`). Pure:
 * the canvas and the image export both draw from these routes, so they
 * always match.
 *
 * "straight" is Linkkit's own arrow (`linkGeometry`): box edge to box edge
 * with an arrowhead.
 *
 * "elbow" is Treekit's line: it leaves the middle of a box's far side (its
 * bottom top-down, its right side left-right), runs half the gap, turns
 * along the row to above the box it leads to, and goes into the middle of
 * that box's near side, with rounded corners and no arrowhead. Every line
 * out of one box turns at the same depth, so a box's next steps hang off
 * one comb, as in Treekit. A label sits on the last stretch into its box,
 * centred between the turn and the box (Treekit's spot); an only arrow
 * that runs straight has its label in the middle of the whole gap.
 *
 * Treekit only ever has that shape. A Linkkit map can also have a box with
 * two ways in, loops, and boxes dragged anywhere, so the elbow style has
 * three extra rules to stay readable:
 * - Two (or more) lines into one box come in side by side across its near
 *   side, each with its own stretch and label, instead of on one line.
 * - Boxes in one row whose combs would run along the same line (they share
 *   a box after them) turn a little apart, so each comb reads as its own.
 * - A label whose stretch is crowded (several ways into one box) moves
 *   along its own line to a free spot.
 * - A line that can't run down the map (its box is level with, or above,
 *   the box it comes from: a loop, or a box dragged up) still turns at
 *   right angles, but leaves and enters by the boxes' sides, and gets an
 *   arrowhead, since which way it goes can't be told from up and down any
 *   more. Beside each other: across, turning in the middle. Above: round
 *   the right side (the bottom, left-right), in a lane clear of both boxes.
 * - Two arrows between the same two boxes, one each way, are drawn apart.
 */

export interface ElbowOptions {
  /** Corner rounding (Treekit's `borderRadius`). */
  readonly corner: number;
  /** The least gap between two boxes, down the map, for a line to run
      down it (with room for its corners). */
  readonly minGap: number;
  /** How far apart lines into the same box come in. */
  readonly entrySpread: number;
  /** How far past the boxes a line round their side runs. */
  readonly lane: number;
  /** The least gap across the map for a line to run across it, turning in
      the middle (room for both corners and an arrowhead). */
  readonly sideGap: number;
  /** How far apart the turns of combs sharing a row are staggered. */
  readonly stagger: number;
}

export interface RouteOptions {
  readonly arrow: ArrowOptions;
  readonly elbow: ElbowOptions;
  /** How far apart two arrows between the same boxes, one each way, are
      drawn. */
  readonly twinOffset: number;
}

export interface ArrowRoute {
  /** The line's corners, from where it leaves its box to where it stops
      (the arrowhead's base, or the box itself when there is no head). */
  readonly points: readonly Point[];
  /** Corner rounding: 0 for a straight arrow. */
  readonly corner: number;
  /** The arrowhead (tip, then the two back corners), or none. */
  readonly head: readonly [Point, Point, Point] | null;
  /** Where the arrow meets the box it points into. */
  readonly tip: Point;
  /** The stretch its label sits on (and may slide along, `placeLabels`). */
  readonly labelFrom: Point;
  readonly labelTo: Point;
}

/** The middle of a route's label stretch. */
export const routeMiddle = (r: ArrowRoute): Point => ({
  x: (r.labelFrom.x + r.labelTo.x) / 2,
  y: (r.labelFrom.y + r.labelTo.y) / 2,
});

/** `from` moved `by` towards `to` (stops at `to`). */
export function towards(from: Point, to: Point, by: number): Point {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len === 0) return from;
  const t = Math.min(1, by / len);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** An SVG path through `points`, each corner rounded by up to `radius`
    (and never more than half of either side, as React Flow's smooth step
    does, so short stretches stay whole). */
export function roundedPath(points: readonly Point[], radius: number): string {
  if (points.length === 0) return "";
  const f = (n: number) => Math.round(n * 100) / 100;
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const r = Math.min(Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2, radius);
    const p = towards(b, a, r);
    const q = towards(b, c, r);
    d += r > 0 ? `L${f(p.x)} ${f(p.y)}Q${f(b.x)} ${f(b.y)} ${f(q.x)} ${f(q.y)}` : `L${f(b.x)} ${f(b.y)}`;
  }
  const last = points[points.length - 1];
  return points.length > 1 ? `${d}L${f(last.x)} ${f(last.y)}` : d;
}

/** An arrowhead's triangle as an SVG path. */
export const headPath = ([tip, left, right]: readonly [Point, Point, Point]): string =>
  `M${tip.x} ${tip.y}L${left.x} ${left.y}L${right.x} ${right.y}Z`;

/** The two ends of a route's line, each with the point it heads for, for
    the end handles (relinking). */
export function routeEnds(r: ArrowRoute): { from: [Point, Point]; to: [Point, Point] } {
  const p = r.points;
  return { from: [p[0], p[1] ?? r.tip], to: [r.tip, p.length > 1 ? p[p.length - 2] : p[0]] };
}

/**
 * Every drawable arrow's route. `labelSizes` holds the arrows that have a
 * label (measured, or a fallback): the elbow style leaves room for them
 * below the turn. An arrow with a missing box, or whose boxes overlap so
 * there is no room for it, has no route.
 */
export function arrowRoutes(
  links: readonly Link[],
  boxes: ReadonlyMap<NodeId, Box>,
  style: ArrowStyle,
  direction: LayoutDirection,
  options: RouteOptions,
  labelSizes: ReadonlyMap<LinkId, Size> = new Map(),
): Map<LinkId, ArrowRoute> {
  const drawn = links.filter((l) => l.from !== l.to && boxes.has(l.from) && boxes.has(l.to));
  const pairs = new Set(drawn.map((l) => `${l.from}>${l.to}`));
  const twinOf = (l: Link) => (pairs.has(`${l.to}>${l.from}`) ? options.twinOffset : 0);
  const out = new Map<LinkId, ArrowRoute>();
  if (style === "straight") {
    for (const l of drawn) {
      const g = linkGeometry(boxes.get(l.from)!, boxes.get(l.to)!, options.arrow, twinOf(l));
      if (g) out.set(l.id, { points: [g.start, g.end], corner: 0, head: g.head, tip: g.head[0], labelFrom: g.start, labelTo: g.head[0] });
    }
    return out;
  }

  // Elbows work in depth (down the map: y top-down, x left-right) and
  // across (the other axis), so one piece of code serves both directions.
  const vertical = direction === "TB";
  const pt = (depth: number, across: number): Point => (vertical ? { x: across, y: depth } : { x: depth, y: across });
  const spanOf = (id: NodeId) => {
    const { center, size } = boxes.get(id)!;
    const depth = vertical ? center.y : center.x;
    const across = vertical ? center.x : center.y;
    const dh = (vertical ? size.height : size.width) / 2;
    const ah = (vertical ? size.width : size.height) / 2;
    return { near: depth - dh, far: depth + dh, mid: depth, across, lo: across - ah, hi: across + ah };
  };
  const { corner, minGap, entrySpread, lane, sideGap, stagger } = options.elbow;
  const { gap, headLength, headWidth } = options.arrow;

  // 1. Lines that run down the map: Treekit's shape.
  const forward = drawn.filter((l) => spanOf(l.to).near - spanOf(l.from).far >= minGap);
  const group = (key: (l: Link) => NodeId) => {
    const m = new Map<NodeId, Link[]>();
    for (const l of forward) m.set(key(l), [...(m.get(key(l)) ?? []), l]);
    return m;
  };
  const kids = group((l) => l.from);
  const labelDepth = (l: Link) => {
    const s = labelSizes.get(l.id);
    return s ? (vertical ? s.height : s.width) : 0;
  };
  // Where each box's lines turn: half the gap left once its labels have
  // their room below the turn (Treekit: half a rank gap past the parent's
  // row, labels in the band after it). An only line has its label in the
  // middle of the whole gap instead, so it leaves no band.
  const turnOf = new Map<NodeId, number>();
  for (const [from, ls] of kids) {
    const far = spanOf(from).far;
    const g = Math.min(...ls.map((l) => spanOf(l.to).near - far));
    const band = ls.length > 1 ? Math.max(...ls.map(labelDepth)) : 0;
    turnOf.set(from, far + Math.max((g - band) / 2, Math.min(g / 2, corner)));
  }
  // Where each line comes into its box: the middle, or side by side when
  // a box has more than one way in (ordered as their boxes sit, so the
  // lines don't cross on the way in).
  const entryOf = new Map<LinkId, number>();
  for (const [to, ls] of group((l) => l.to)) {
    const t = spanOf(to);
    const sorted = [...ls].sort((a, b) => spanOf(a.from).across - spanOf(b.from).across || (a.id < b.id ? -1 : 1));
    const k = sorted.length;
    const step = k > 1 ? Math.min(entrySpread, ((t.hi - t.lo) * 0.8) / (k - 1)) : 0;
    sorted.forEach((l, i) => entryOf.set(l.id, t.across + (i - (k - 1) / 2) * step));
  }
  // Combs that would run along one line (turning at the same depth, and
  // overlapping across) are staggered, as far as their gaps allow: the
  // leftmost (topmost) box's turns first.
  const combs = [...kids].map(([from, ls]) => {
    const across = [spanOf(from).across, ...ls.map((l) => entryOf.get(l.id)!)];
    const band = ls.length > 1 ? Math.max(...ls.map(labelDepth)) : 0;
    return {
      from,
      lo: Math.min(...across),
      hi: Math.max(...across),
      turn: turnOf.get(from)!,
      first: spanOf(from).far + corner / 2,
      last: Math.min(...ls.map((l) => spanOf(l.to).near)) - band - corner / 2,
    };
  });
  combs.sort((a, b) => a.turn - b.turn || a.lo - b.lo);
  const rows: (typeof combs)[] = [];
  for (const c of combs) {
    const row = rows.find((r) => r.some((o) => Math.abs(o.turn - c.turn) < stagger && o.lo < c.hi && c.lo < o.hi));
    if (row) row.push(c);
    else rows.push([c]);
  }
  for (const row of rows) {
    if (row.length < 2) continue;
    row.sort((a, b) => a.lo - b.lo);
    const first = Math.max(...row.map((c) => c.first));
    const last = Math.min(...row.map((c) => c.last));
    if (last <= first) continue;
    const step = Math.min(stagger, (last - first) / (row.length - 1));
    const mean = row.reduce((sum, c) => sum + c.turn, 0) / row.length;
    row.forEach((c, i) => {
      turnOf.set(c.from, Math.min(last, Math.max(first, mean + (i - (row.length - 1) / 2) * step)));
    });
  }

  for (const l of forward) {
    const s = spanOf(l.from);
    const t = spanOf(l.to);
    const entry = entryOf.get(l.id)!;
    const turn = turnOf.get(l.from)!;
    const start = pt(s.far, s.across);
    const end = pt(t.near, entry);
    const straight = Math.abs(entry - s.across) < 0.5;
    const points = straight ? [start, end] : [start, pt(turn, s.across), pt(turn, entry), end];
    const only = kids.get(l.from)!.length === 1;
    out.set(l.id, {
      points,
      corner,
      head: null,
      tip: end,
      labelFrom: straight && only ? start : pt(turn, entry),
      labelTo: end,
    });
  }

  // 2. Every other line: by the boxes' sides, with an arrowhead.
  const headed = (points: Point[], tip: Point): ArrowRoute => {
    const back = points[points.length - 1];
    const len = Math.hypot(tip.x - back.x, tip.y - back.y) || 1;
    const ux = (tip.x - back.x) / len;
    const uy = (tip.y - back.y) / len;
    const base = { x: tip.x - ux * headLength, y: tip.y - uy * headLength };
    const half = headWidth / 2;
    const head: [Point, Point, Point] = [
      tip,
      { x: base.x - uy * half, y: base.y + ux * half },
      { x: base.x + uy * half, y: base.y - ux * half },
    ];
    return { points: [...points, base], corner, head, tip, labelFrom: points[0], labelTo: tip };
  };
  const forwardIds = new Set(forward.map((l) => l.id));
  for (const l of drawn) {
    if (forwardIds.has(l.id)) continue;
    const s = spanOf(l.from);
    const t = spanOf(l.to);
    const twin = twinOf(l);
    const depthOverlap = Math.min(s.far, t.far) - Math.max(s.near, t.near);
    const sign = Math.sign(t.across - s.across) || 1;
    const acrossGap = sign > 0 ? t.lo - s.hi : s.lo - t.hi;
    if (depthOverlap > 0 && acrossGap <= 0) continue; // the boxes overlap

    if (acrossGap >= sideGap || (depthOverlap > 0 && acrossGap > gap + headLength + 2)) {
      // Beside each other: across, turning in the middle (or one straight
      // run, where the boxes face each other and the gap is short).
      const shift = twin * sign;
      const out0 = sign > 0 ? s.hi : s.lo;
      const tipAt = (sign > 0 ? t.lo : t.hi) - sign * gap;
      let sd = s.mid + shift;
      let td = t.mid + shift;
      if (acrossGap < sideGap) {
        const shared = (Math.max(s.near, t.near) + Math.min(s.far, t.far)) / 2 + shift;
        sd = shared;
        td = shared;
      }
      const middle = (out0 + tipAt) / 2;
      const turns = Math.abs(sd - td) < 0.5 ? [] : [pt(sd, middle), pt(td, middle)];
      const route = headed([pt(sd, out0), ...turns], pt(td, tipAt));
      out.set(l.id, turns.length ? { ...route, labelFrom: turns[0], labelTo: turns[1] } : route);
      continue;
    }

    // Above (or only just below) it: round the far side, in a lane clear
    // of both boxes.
    const up = Math.sign(t.mid - s.mid) || 1;
    const shift = twin * up;
    const laneAt = Math.max(s.hi, t.hi) + lane + (shift > 0 ? 2 * twin : 0);
    const sd = s.mid + shift;
    const td = t.mid + shift;
    const route = headed([pt(sd, s.hi), pt(sd, laneAt), pt(td, laneAt)], pt(td, t.hi + gap));
    out.set(l.id, { ...route, labelFrom: pt(sd, laneAt), labelTo: pt(td, laneAt) });
  }
  return out;
}
