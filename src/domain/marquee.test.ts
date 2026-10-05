import { describe, expect, it } from "vitest";

import { boxesIn, holds, marqueeSelection, rectBetween } from "./marquee";
import { ids } from "./testMaps";

const size = { width: 40, height: 20 };

describe("marquee", () => {
  it("makes the same rectangle whichever way it is dragged", () => {
    expect(rectBetween({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 40, height: 60 });
  });

  it("picks a box only when it holds all of it", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(holds(rect, { x: 50, y: 50 }, size)).toBe(true);
    expect(holds(rect, { x: 20, y: 10 }, size)).toBe(true); // touching the edges
    expect(holds(rect, { x: 90, y: 50 }, size)).toBe(false); // sticks out on the right
  });

  it("lists every box inside", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    const [a, b, c] = ids("a", "b", "c");
    const boxes = [
      [a, { center: { x: 30, y: 30 }, size }],
      [b, { center: { x: 300, y: 30 }, size }],
      [c, { center: { x: 60, y: 70 }, size }],
    ] as const;
    expect(boxesIn(rect, boxes)).toEqual([a, c]);
  });

  it("replaces the selection, or adds to it with Shift", () => {
    const [a, b, c] = ids("a", "b", "c");
    expect(marqueeSelection([a, b], [c], false)).toEqual([c]);
    expect(marqueeSelection([a, b], [b, c], true)).toEqual([a, b, c]);
  });
});
