import { describe, expect, it } from "vitest";

import { exampleMap } from "./example";
import { asNodeId } from "./ids";
import { arrowGap, layerNodes, layoutMap, loopBreakingLinks } from "./layout";
import { build } from "./testMaps";
import type { NodeId, Size } from "./types";

const options = { columnGap: 30, rowGap: 70, fallbackSize: { width: 100, height: 36 } };
const noSizes = new Map<NodeId, Size>();
const layersOf = (map: Parameters<typeof layerNodes>[0]) => Object.fromEntries(layerNodes(map));

describe("loopBreakingLinks", () => {
  it("finds nothing to break when there is no loop", () => {
    expect(loopBreakingLinks(build(["a", "b", "c"], [["a", "b"], ["b", "c"], ["a", "c"]])).size).toBe(0);
  });

  it("breaks each loop at its closing arrow, starting from the natural top", () => {
    // top -> a -> b -> c -> a: the loop is entered at a, so c -> a closes it.
    const map = build(["c", "b", "a", "top"], [["top", "a"], ["a", "b"], ["b", "c"], ["c", "a"]]);
    expect([...loopBreakingLinks(map)]).toEqual(["c>a"]);
  });

  it("breaks a loop with no top, and two-box loops", () => {
    expect(loopBreakingLinks(build(["a", "b"], [["a", "b"], ["b", "a"]])).size).toBe(1);
  });
});

describe("layerNodes", () => {
  it("puts each box one row below the lowest box that needs it", () => {
    const map = build(["a", "b", "c"], [["a", "b"], ["b", "c"], ["a", "c"]]);
    expect(layersOf(map)).toEqual({ a: 0, b: 1, c: 2 });
  });

  it("keeps a loop compact: no rows pushed far down", () => {
    const map = build(["top", "a", "b", "c"], [["top", "a"], ["a", "b"], ["b", "c"], ["c", "a"]]);
    expect(layersOf(map)).toEqual({ top: 0, a: 1, b: 2, c: 3 });
  });

  it("leaves no empty row", () => {
    const rows = new Set(layerNodes(exampleMap({ width: 900, height: 560 })).values());
    expect([...rows].sort()).toEqual([...Array(rows.size).keys()]);
  });
});

describe("layoutMap", () => {
  it("centres each row and stacks rows downward", () => {
    const map = build(["a", "b", "c"], [["a", "b"], ["a", "c"]]);
    const { positions, bounds } = layoutMap(map, noSizes, options);
    expect(positions.get(asNodeId("a"))).toEqual({ x: 0, y: 18 });
    expect(positions.get(asNodeId("b"))).toEqual({ x: -65, y: 124 });
    expect(positions.get(asNodeId("c"))).toEqual({ x: 65, y: 124 });
    expect(bounds).toEqual({ left: -115, top: 0, right: 115, bottom: 142 });
  });

  it("uses measured sizes, and orders a row under the boxes that need it", () => {
    // left needs y, right needs x: x should end up under right, y under left.
    const map = build(["left", "right", "x", "y"], [["left", "y"], ["right", "x"]]);
    const sizes = new Map<NodeId, Size>([[asNodeId("left"), { width: 200, height: 50 }]]);
    const { positions } = layoutMap(map, sizes, options);
    expect(positions.get(asNodeId("left"))!.y).toBe(25);
    expect(positions.get(asNodeId("y"))!.x).toBeLessThan(positions.get(asNodeId("x"))!.x);
  });

  it("lays out the example map without overlaps and with sign-in above what it needs", () => {
    const map = exampleMap({ width: 900, height: 560 });
    const { positions, loopLinks } = layoutMap(map, noSizes, options);
    expect(loopLinks.size).toBe(0);
    const byName = (name: string) => positions.get(Object.values(map.nodes).find((n) => n.name === name)!.id)!;
    expect(byName("Outlook").y).toBeLessThan(byName("Microsoft 365 sign-in").y);
    expect(byName("Microsoft 365 sign-in").y).toBeLessThan(byName("MFA approval").y);
    const points = [...positions.values()];
    for (const [i, p] of points.entries()) {
      for (const q of points.slice(i + 1)) {
        const apart = Math.abs(p.x - q.x) >= options.fallbackSize.width || Math.abs(p.y - q.y) >= options.fallbackSize.height;
        expect(apart).toBe(true);
      }
    }
  });

  it("handles an empty map", () => {
    const { positions, bounds } = layoutMap(build([]), noSizes, options);
    expect(positions.size).toBe(0);
    expect(bounds).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });
});

describe("layoutMap left-right", () => {
  const map = build(["a", "b", "c"], [["a", "b"], ["a", "c"]]);
  const wide = new Map<NodeId, Size>([
    [asNodeId("a"), { width: 200, height: 40 }],
    [asNodeId("b"), { width: 100, height: 40 }],
    [asNodeId("c"), { width: 100, height: 60 }],
  ]);

  it("puts a box left of what it needs, rows becoming columns", () => {
    const { positions } = layoutMap(map, wide, options, "LR");
    const a = positions.get(asNodeId("a"))!;
    const b = positions.get(asNodeId("b"))!;
    const c = positions.get(asNodeId("c"))!;
    // a is 200 wide: its column ends at 200, then rowGap, then b and c.
    expect(a).toEqual({ x: 100, y: 0 });
    expect(b.x).toBe(200 + 70 + 50);
    expect(c.x).toBe(b.x);
    // b and c stack top to bottom, columnGap apart, centred on y = 0.
    // (40 + 30 + 60 = 130 tall, from -65 to 65.)
    expect(b.y).toBe(-45);
    expect(c.y).toBe(35);
  });

  it("is the top-down layout with x and y swapped (on swapped sizes)", () => {
    const swapped = new Map([...wide].map(([id, s]) => [id, { width: s.height, height: s.width }]));
    const down = layoutMap(map, swapped, { ...options, fallbackSize: { width: 36, height: 100 } }, "TB");
    const across = layoutMap(map, wide, options, "LR");
    for (const [id, p] of down.positions) expect(across.positions.get(id)).toEqual({ x: p.y, y: p.x });
    expect(across.bounds).toEqual({
      left: down.bounds.top,
      top: down.bounds.left,
      right: down.bounds.bottom,
      bottom: down.bounds.right,
    });
  });

  it("follows the map's own direction by default", () => {
    const lr = { ...map, direction: "LR" as const };
    expect(layoutMap(lr, wide, options)).toEqual(layoutMap(map, wide, options, "LR"));
  });
});

describe("arrowGap", () => {
  const labels = [
    { width: 48, height: 22 },
    { width: 80, height: 20 },
  ];

  it("leaves room for the deepest label along the arrows, then the extra", () => {
    // Top-down the tallest label (22) counts; left-right the widest (80).
    expect(arrowGap(15, labels, "TB", 19)).toBe(22 + 19 + 15);
    expect(arrowGap(15, labels, "LR", 19)).toBe(80 + 19 + 15);
  });

  it("is only the ends and the extra when there are no labels", () => {
    expect(arrowGap(47, [], "TB", 19)).toBe(66);
  });
});
