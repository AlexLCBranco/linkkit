import { describe, expect, it } from "vitest";

import { boxesIn, marqueeSelection, rectBetween, touches } from "./marquee";
import { ids } from "./testMaps";

const size = { width: 40, height: 20 };

describe("marquee", () => {
  it("makes the same rectangle whichever way it is dragged", () => {
    expect(rectBetween({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 40, height: 60 });
  });

  it("picks a box as soon as it touches any part of it", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(touches(rect, { x: 50, y: 50 }, size)).toBe(true); // wholly inside
    expect(touches(rect, { x: 110, y: 50 }, size)).toBe(true); // half sticks out on the right
    expect(touches(rect, { x: 120, y: 50 }, size)).toBe(true); // touching the edge
    expect(touches(rect, { x: 130, y: 50 }, size)).toBe(false); // clear of it
  });

  it("lists every box it touches, so a strip dragged through a row picks the whole row", () => {
    const strip = { x: 0, y: 45, width: 400, height: 10 };
    const [a, b, c] = ids("a", "b", "c");
    const boxes = [
      [a, { center: { x: 30, y: 50 }, size }],
      [b, { center: { x: 300, y: 50 }, size }],
      [c, { center: { x: 60, y: 200 }, size }],
    ] as const;
    expect(boxesIn(strip, boxes)).toEqual([a, b]);
  });

  it("replaces the selection, or adds to it with Shift", () => {
    const [a, b, c] = ids("a", "b", "c");
    expect(marqueeSelection([a, b], [c], false)).toEqual([c]);
    expect(marqueeSelection([a, b], [b, c], true)).toEqual([a, b, c]);
  });
});
