import { describe, expect, it } from "vitest";

import { borderPoint, linkGeometry, type Box } from "./geometry";

const box = (x: number, y: number, width = 100, height = 40): Box => ({ center: { x, y }, size: { width, height } });
const ARROW = { gap: 5, headLength: 10, headWidth: 8 };

describe("borderPoint", () => {
  it("leaves through the side facing the target, pushed out by the gap", () => {
    expect(borderPoint(box(0, 0), { x: 500, y: 0 }, 5)).toEqual({ x: 55, y: 0 });
    expect(borderPoint(box(0, 0), { x: 0, y: -500 }, 5)).toEqual({ x: 0, y: -25 });
  });

  it("leaves through a corner region on the diagonal, whichever side comes first", () => {
    // Toward (100, 100): the top/bottom sides (half-height 20) are hit first.
    expect(borderPoint(box(0, 0), { x: 100, y: 100 }, 0)).toEqual({ x: 20, y: 20 });
  });

  it("has no direction when the target is the centre", () => {
    expect(borderPoint(box(0, 0), { x: 0, y: 0 }, 5)).toBeNull();
  });
});

describe("linkGeometry", () => {
  it("runs from border to border, the head ending at the target's gap", () => {
    const g = linkGeometry(box(0, 0), box(0, 200), ARROW)!;
    expect(g.start).toEqual({ x: 0, y: 25 });
    expect(g.head[0]).toEqual({ x: 0, y: 175 });
    expect(g.end).toEqual({ x: 0, y: 165 });
    expect(g.middle).toEqual({ x: 0, y: 100 });
  });

  it("spreads the head's back corners across the line, headWidth apart", () => {
    const [, left, right] = linkGeometry(box(0, 0), box(300, 0), ARROW)!.head;
    expect(left.x).toBeCloseTo(right.x);
    expect(Math.abs(left.y - right.y)).toBeCloseTo(8);
  });

  it("draws nothing for overlapping boxes or boxes on the same spot", () => {
    expect(linkGeometry(box(0, 0), box(30, 0), ARROW)).toBeNull();
    expect(linkGeometry(box(0, 0), box(0, 0), ARROW)).toBeNull();
  });

  it("draws nothing when the line would be shorter than its head", () => {
    // Borders 112 apart on x; with 5px gaps each, 2px of line is left.
    expect(linkGeometry(box(0, 0), box(112, 0), ARROW)).toBeNull();
  });
});
