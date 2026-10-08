import { describe, expect, it } from "vitest";

import { arrowRoutes, roundedPath, routeEnds, routeMiddle, type RouteOptions } from "./arrows";
import { linkGeometry, type Box } from "./geometry";
import { asLinkId, asNodeId } from "./ids";
import type { Link, LinkId, NodeId, Size } from "./types";

const OPTIONS: RouteOptions = {
  arrow: { gap: 5, headLength: 9, headWidth: 9 },
  twinOffset: 7,
  elbow: { corner: 10, minGap: 16, entrySpread: 14, lane: 24, sideGap: 32, stagger: 8 },
};

/** Boxes 100 x 40 at the given centres, by name. */
function boxes(at: Record<string, [number, number]>): Map<NodeId, Box> {
  return new Map(
    Object.entries(at).map(([name, [x, y]]) => [asNodeId(name), { center: { x, y }, size: { width: 100, height: 40 } }]),
  );
}

/** Arrows from "from>to" names. */
const links = (...pairs: string[]): Link[] =>
  pairs.map((p) => {
    const [from, to] = p.split(">");
    return { id: asLinkId(p), from: asNodeId(from), to: asNodeId(to), label: "" };
  });

const elbows = (b: Map<NodeId, Box>, l: Link[], direction: "TB" | "LR" = "TB", labels = new Map<LinkId, Size>()) =>
  arrowRoutes(l, b, "elbow", direction, OPTIONS, labels);

const route = (routes: ReturnType<typeof elbows>, key: string) => routes.get(asLinkId(key))!;

describe("straight arrows", () => {
  it("are Linkkit's own arrows, unchanged", () => {
    const b = boxes({ a: [0, 0], b: [200, 150] });
    const r = route(arrowRoutes(links("a>b"), b, "straight", "TB", OPTIONS), "a>b");
    const g = linkGeometry(b.get(asNodeId("a"))!, b.get(asNodeId("b"))!, OPTIONS.arrow)!;
    expect(r).toEqual({ points: [g.start, g.end], corner: 0, head: g.head, tip: g.head[0], labelFrom: g.start, labelTo: g.head[0] });
    expect(routeMiddle(r)).toEqual(g.middle);
  });
});

describe("elbow lines (Treekit's)", () => {
  // p's bottom is at 20; a and b's tops at 80.
  const family = boxes({ p: [200, 0], a: [100, 100], b: [300, 100] });

  it("leave the middle of the box's far side, turn half way, and go into the middle of the near side", () => {
    const routes = elbows(family, links("p>a", "p>b"));
    expect(route(routes, "p>a")).toMatchObject({
      points: [
        { x: 200, y: 20 },
        { x: 200, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 80 },
      ],
      head: null,
      corner: 10,
      tip: { x: 100, y: 80 },
    });
    // Every line out of one box turns at the same depth: one comb.
    expect(route(routes, "p>b").points[1]).toEqual({ x: 200, y: 50 });
  });

  it("put a label on the last stretch, between the turn and its box, with room below the turn", () => {
    const labels = new Map([
      [asLinkId("p>a"), { width: 50, height: 20 }],
      [asLinkId("p>b"), { width: 50, height: 20 }],
    ]);
    const r = route(elbows(family, links("p>a", "p>b"), "TB", labels), "p>a");
    // The 60px gap less the 20px label band, halved: the turn is 20 past p.
    expect(r.points[1]).toEqual({ x: 200, y: 40 });
    expect(r.labelFrom).toEqual({ x: 100, y: 40 });
    expect(r.labelTo).toEqual({ x: 100, y: 80 });
    expect(routeMiddle(r)).toEqual({ x: 100, y: 60 });
  });

  it("run straight to an only next step, its label in the middle of the gap", () => {
    const r = route(elbows(boxes({ p: [200, 0], c: [200, 100] }), links("p>c")), "p>c");
    expect(r.points).toEqual([
      { x: 200, y: 20 },
      { x: 200, y: 80 },
    ]);
    expect(routeMiddle(r)).toEqual({ x: 200, y: 50 });
  });

  it("run left to right in a left-right map", () => {
    const r = route(elbows(boxes({ p: [0, 200], a: [200, 100], b: [200, 300] }), links("p>a", "p>b"), "LR"), "p>a");
    expect(r.points).toEqual([
      { x: 50, y: 200 },
      { x: 100, y: 200 },
      { x: 100, y: 100 },
      { x: 150, y: 100 },
    ]);
    expect(r.head).toBeNull();
  });

  it("bring two ways into one box in side by side, each on its own stretch", () => {
    const routes = elbows(boxes({ p1: [100, 0], p2: [300, 0], c: [200, 100] }), links("p2>c", "p1>c"));
    expect(route(routes, "p1>c").tip).toEqual({ x: 193, y: 80 });
    expect(route(routes, "p2>c").tip).toEqual({ x: 207, y: 80 });
  });

  it("stagger the turns of combs in one row that would run along one line", () => {
    const routes = elbows(boxes({ p1: [100, 0], p2: [300, 0], a: [100, 100], c: [300, 100] }), links("p1>a", "p1>c", "p2>a", "p2>c"));
    const turn1 = route(routes, "p1>c").points[1].y;
    const turn2 = route(routes, "p2>a").points[1].y;
    expect(turn1).not.toBe(turn2);
    // Each comb still turns at one depth, inside the gap.
    expect(route(routes, "p1>a").points[1].y).toBe(turn1);
    for (const t of [turn1, turn2]) expect(t > 20 && t < 80).toBe(true);
    // A comb on its own is left where Treekit puts it.
    const alone = elbows(boxes({ p: [200, 0], a: [100, 100], b: [300, 100] }), links("p>a", "p>b"));
    expect(route(alone, "p>a").points[1].y).toBe(50);
  });

  it("go round the side, with an arrowhead, into a box above (a loop)", () => {
    const routes = elbows(boxes({ a: [200, 0], b: [200, 100], c: [200, 200] }), links("a>b", "b>c", "c>a"));
    expect(route(routes, "a>b").head).toBeNull();
    expect(route(routes, "b>c").head).toBeNull();
    const back = route(routes, "c>a");
    expect(back.head).not.toBeNull();
    // Out of c's right side, up a lane clear of both boxes, into a's right side.
    expect(back.points[0]).toEqual({ x: 250, y: 200 });
    expect(back.points[1]).toEqual({ x: 274, y: 200 });
    expect(back.points[2]).toEqual({ x: 274, y: 0 });
    expect(back.tip).toEqual({ x: 255, y: 0 });
    expect(back.head![0]).toEqual(back.tip);
  });

  it("draw two arrows between the same boxes, one each way, apart", () => {
    const routes = elbows(boxes({ a: [200, 0], b: [200, 100] }), links("a>b", "b>a"));
    expect(route(routes, "a>b").head).toBeNull();
    const back = route(routes, "b>a");
    expect(back.head).not.toBeNull();
    // Down the middle one way, round the right side the other.
    expect(route(routes, "a>b").points.every((p) => p.x === 200)).toBe(true);
    expect(back.points.every((p) => p.x >= 250)).toBe(true);

    // Side by side: both run across, at different heights.
    const side = elbows(boxes({ a: [0, 0], b: [300, 0] }), links("a>b", "b>a"));
    expect(route(side, "a>b").tip.y).not.toBe(route(side, "b>a").tip.y);
  });

  it("run across, turning in the middle, to a box beside it", () => {
    const r = route(elbows(boxes({ a: [0, 0], b: [300, 30] }), links("a>b")), "a>b");
    expect(r.points.slice(0, 3)).toEqual([
      { x: 50, y: 0 },
      { x: 147.5, y: 0 },
      { x: 147.5, y: 30 },
    ]);
    expect(r.tip).toEqual({ x: 245, y: 30 });
    expect(r.head).not.toBeNull();
  });

  it("leave out an arrow whose boxes overlap, or that has a missing box", () => {
    const b = boxes({ a: [0, 0], b: [20, 10] });
    expect(elbows(b, links("a>b", "a>gone")).size).toBe(0);
  });
});

describe("drawing a route", () => {
  it("rounds each corner, never by more than half a side", () => {
    expect(
      roundedPath(
        [
          { x: 0, y: 0 },
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
        10,
      ),
    ).toBe("M0 0L0 40Q0 50 10 50L100 50");
    expect(
      roundedPath(
        [
          { x: 0, y: 0 },
          { x: 0, y: 6 },
          { x: 100, y: 6 },
        ],
        10,
      ),
    ).toBe("M0 0L0 3Q0 6 3 6L100 6");
  });

  it("knows each end and the way the line leaves it, for the end handles", () => {
    const r = route(elbows(boxes({ p: [200, 0], a: [100, 100], b: [300, 100] }), links("p>a", "p>b")), "p>a");
    expect(routeEnds(r)).toEqual({
      from: [
        { x: 200, y: 20 },
        { x: 200, y: 50 },
      ],
      to: [
        { x: 100, y: 80 },
        { x: 100, y: 50 },
      ],
    });
  });
});
