import { describe, expect, it } from "vitest";

import { exampleMap } from "./example";
import { asNodeId } from "./ids";
import { layerNodes, layoutMap, loopBreakingLinks } from "./layout";
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
