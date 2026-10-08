import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "./ids";
import { layoutMap } from "./layout";
import { buildTree } from "./testMaps";
import type { LinkId, LinkMap, NodeId, Point, Size } from "./types";

/** Tidy up's numbers for a tree at Medium arrows (Treekit's 64 between rows). */
const options = { columnGap: 32, rowGap: 64, fallbackSize: { width: 100, height: 36 } };
const noSizes = new Map<NodeId, Size>();
const id = asNodeId;

/**
 * The audit's 34-box tree ("Move abroad?"): a start, 3 options, 2 places
 * under each, 4 ways to live under each place.
 */
function audit34(): LinkMap {
  const names = ["start"];
  const arrows: [string, string, string?][] = [];
  const options = ["Portugal", "Germany", "Stay"];
  const places: Record<string, string[]> = { Portugal: ["Lisbon", "Porto"], Germany: ["Berlin", "Munich"], Stay: ["Renovate", "NewJob"] };
  for (const o of options) {
    names.push(o);
    arrows.push(["start", o]);
    for (const p of places[o]) {
      names.push(p);
      arrows.push([o, p]);
      for (const w of ["rent", "buy", "short", "family"]) {
        names.push(`${p}-${w}`);
        arrows.push([p, `${p}-${w}`]);
      }
    }
  }
  return buildTree(names[0], names.slice(1), arrows);
}

const childrenIn = (map: LinkMap, parent: string) =>
  Object.values(map.links).filter((l) => l.from === parent).map((l) => l.to);

function overlaps(map: LinkMap, positions: ReadonlyMap<NodeId, Point>, size: Size, gap: number): boolean {
  const ids = Object.keys(map.nodes) as NodeId[];
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue;
      const p = positions.get(a)!;
      const q = positions.get(b)!;
      if (Math.abs(p.y - q.y) < size.height && Math.abs(p.x - q.x) < size.width + gap - 0.001) return true;
    }
  }
  return false;
}

describe("Tidy up in a tree (Treekit's tidy tree)", () => {
  it("has 34 boxes in the audit's tree", () => {
    expect(Object.keys(audit34().nodes)).toHaveLength(34);
  });

  it("centres every parent over its next steps", () => {
    const map = audit34();
    const { positions } = layoutMap(map, noSizes, options);
    for (const parent of Object.keys(map.nodes)) {
      const kids = childrenIn(map, parent);
      if (kids.length === 0) continue;
      const xs = kids.map((k) => positions.get(k)!.x);
      expect(positions.get(id(parent))!.x).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2);
    }
  });

  it("keeps sibling order, left to right", () => {
    const { positions } = layoutMap(audit34(), noSizes, options);
    const xs = ["Lisbon-rent", "Lisbon-buy", "Lisbon-short", "Lisbon-family"].map((n) => positions.get(id(n))!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("puts rows 64 apart, every generation in one row", () => {
    const { positions } = layoutMap(audit34(), noSizes, options);
    const rowOf = (n: string) => positions.get(id(n))!.y;
    expect(rowOf("Portugal") - rowOf("start")).toBe(36 + 64);
    expect(rowOf("Lisbon") - rowOf("Portugal")).toBe(36 + 64);
    expect(rowOf("NewJob-family")).toBe(rowOf("Lisbon-rent"));
  });

  it("never lets two boxes overlap (at least a column gap apart)", () => {
    const map = audit34();
    const { positions } = layoutMap(map, noSizes, options);
    expect(overlaps(map, positions, options.fallbackSize, options.columnGap)).toBe(false);
  });

  it("is centred on x = 0 and its bounds hold every box", () => {
    const { positions, bounds } = layoutMap(audit34(), noSizes, options);
    expect(bounds.left + bounds.right).toBeCloseTo(0);
    for (const p of positions.values()) {
      expect(p.x - 50).toBeGreaterThanOrEqual(bounds.left - 0.001);
      expect(p.x + 50).toBeLessThanOrEqual(bounds.right + 0.001);
    }
  });

  it("places a box with two parents under its lowest parent", () => {
    // s -> a -> c -> d, and s -> b -> d: d's lowest parent is c.
    const map = buildTree("s", ["a", "b", "c", "d"], [["s", "a"], ["s", "b"], ["a", "c"], ["c", "d"], ["b", "d"]]);
    const { positions } = layoutMap(map, noSizes, options);
    expect(positions.get(id("d"))!.x).toBeCloseTo(positions.get(id("c"))!.x);
    expect(positions.get(id("d"))!.y).toBeGreaterThan(positions.get(id("c"))!.y);
  });

  it("with both parents in one row, the left one is home", () => {
    // s -> a, b (a first); a -> d and b -> d.
    const map = buildTree("s", ["a", "b", "d"], [["s", "a"], ["s", "b"], ["a", "d"], ["b", "d"]]);
    const { positions } = layoutMap(map, noSizes, options);
    expect(positions.get(id("a"))!.x).toBeLessThan(positions.get(id("b"))!.x);
    expect(positions.get(id("d"))!.x).toBeCloseTo(positions.get(id("a"))!.x);
  });

  it("takes no room for the second parent's arrow", () => {
    const map = buildTree("s", ["a", "b", "d"], [["s", "a"], ["s", "b"], ["a", "d"], ["b", "d"]]);
    const alone = buildTree("s", ["a", "b", "d"], [["s", "a"], ["s", "b"], ["a", "d"]]);
    expect(layoutMap(map, noSizes, options).positions).toEqual(layoutMap(alone, noSizes, options).positions);
  });

  it("turns on its side left-right: columns, each parent centred beside its next steps", () => {
    const map = { ...audit34(), direction: "LR" as const };
    const { positions } = layoutMap(map, noSizes, options, "LR");
    const at = (n: string) => positions.get(id(n))!;
    expect(at("Portugal").x).toBeGreaterThan(at("start").x);
    expect(at("Lisbon").x).toBeGreaterThan(at("Portugal").x);
    // A column's gap runs across: width 100 (on its side) plus 64.
    expect(at("Portugal").x - at("start").x).toBe(100 + 64);
    const ys = childrenIn(map, "Lisbon").map((k) => positions.get(k)!.y);
    expect(at("Lisbon").y).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2);
    expect(at("Lisbon-rent").y).toBeLessThan(at("Lisbon-buy").y);
  });

  it("widens a row's gap by the tallest label on the arrows into it, and only that gap", () => {
    const map = buildTree("s", ["a", "b"], [["s", "a"], ["a", "b", "if the weather is really good"]]);
    const labelSizes = new Map<LinkId, Size>([[asLinkId("a>b"), { width: 120, height: 50 }]]);
    const { positions } = layoutMap(map, noSizes, { ...options, labelSizes });
    const y = (n: string) => positions.get(id(n))!.y;
    expect(y("a") - y("s")).toBe(36 + 64);
    expect(y("b") - y("a")).toBe(36 + 64 + 50);
  });

  it("counts a wide label like a wide box beside its neighbours", () => {
    const map = buildTree("s", ["a", "b"], [["s", "a", "a very long label indeed"], ["s", "b"]]);
    const labelSizes = new Map<LinkId, Size>([[asLinkId("s>a"), { width: 300, height: 20 }]]);
    const { positions } = layoutMap(map, noSizes, { ...options, labelSizes });
    expect(positions.get(id("b"))!.x - positions.get(id("a"))!.x).toBe(150 + 32 + 50);
  });
});
