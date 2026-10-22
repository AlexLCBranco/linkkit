import { describe, expect, it } from "vitest";

import { asNodeId } from "./ids";
import { moveNode, shiftMap } from "./map";
import { nearestFreeSpot } from "./page";
import { readMap, serializeMap } from "./persistence";
import { build } from "./testMaps";

// On the gauntlet whiteboard a box may go left of or above the page's
// corner: everything moves right and down instead, and the map keeps how
// far (`LinkMap.shift`), so the whiteboard keeps it in place (hand-test
// round item 7, 2026-10-21).

const placed = () => moveNode(moveNode(build(["a", "b"]), asNodeId("a"), { x: 100, y: 50 }), asNodeId("b"), { x: 300, y: 80 });
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("shiftMap", () => {
  it("moves every box and adds up the shift; nothing moved is no change", () => {
    const once = shiftMap(placed(), { x: 40, y: 0 });
    expect(once.nodes[asNodeId("a")]).toMatchObject({ x: 140, y: 50 });
    expect(once.nodes[asNodeId("b")]).toMatchObject({ x: 340, y: 80 });
    expect(once.shift).toEqual({ x: 40, y: 0 });
    const twice = shiftMap(once, { x: 10, y: 25 });
    expect(twice.shift).toEqual({ x: 50, y: 25 });
    expect(shiftMap(once, { x: 0, y: 0 })).toBe(once);
    // Back to nothing: no shift kept.
    expect(shiftMap(once, { x: -40, y: 0 }).shift).toBeUndefined();
  });

  it("is saved and read back; a broken one is dropped", () => {
    const map = shiftMap(placed(), { x: 40, y: 12 });
    const saved = roundTrip(serializeMap(map));
    expect(readMap(saved, { width: 800, height: 600 })).toEqual({ status: "ok", map });
    const broken = { ...saved, map: { ...saved.map, shift: { x: "far", y: 1 } } };
    const read = readMap(broken, { width: 800, height: 600 });
    expect(read.status === "ok" && read.map.shift).toBeUndefined();
  });
});

describe("nearestFreeSpot", () => {
  const sizes = new Map([
    [asNodeId("a"), { width: 100, height: 40 }],
    [asNodeId("b"), { width: 100, height: 40 }],
  ]);
  const options = { step: 12, reach: 600, fallbackSize: { width: 120, height: 40 }, clearance: 12 };
  const size = { width: 120, height: 40 };

  it("keeps a free spot as it is", () => {
    expect(nearestFreeSpot(placed(), sizes, { x: 600, y: 400 }, size, options)).toEqual({ x: 600, y: 400 });
  });

  it("moves a spot over a box to the nearest place clear of it", () => {
    const at = { x: 120, y: 50 };
    const spot = nearestFreeSpot(placed(), sizes, at, size, options);
    const a = { x: 100, y: 50 };
    const clear = Math.abs(spot.x - a.x) >= (120 + 100) / 2 + 12 || Math.abs(spot.y - a.y) >= (40 + 40) / 2 + 12;
    expect(clear).toBe(true);
    // Nearer than going round the side: the shorter way out (up or down).
    expect(Math.hypot(spot.x - at.x, spot.y - at.y)).toBeLessThanOrEqual(100);
  });
});
