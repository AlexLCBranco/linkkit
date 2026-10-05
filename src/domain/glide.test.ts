import { describe, expect, it } from "vitest";

import { easeOut, glidePositions } from "./glide";
import { asNodeId } from "./ids";
import type { NodeId, Point } from "./types";

const a = asNodeId("a");
const b = asNodeId("b");

describe("glide", () => {
  it("eases from 0 to 1, faster at the start", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });

  it("moves every box part of the way, and lands exactly", () => {
    const from = new Map<NodeId, Point>([[a, { x: 0, y: 0 }]]);
    const to = new Map<NodeId, Point>([[a, { x: 100, y: 50 }]]);
    expect(glidePositions(from, to, 0).get(a)).toEqual({ x: 0, y: 0 });
    expect(glidePositions(from, to, 1).get(a)).toEqual({ x: 100, y: 50 });
    const mid = glidePositions(from, to, 0.5).get(a)!;
    expect(mid.x).toBeGreaterThan(50);
    expect(mid.y).toBeCloseTo(mid.x / 2);
  });

  it("a box with no starting point is already there", () => {
    const to = new Map<NodeId, Point>([[b, { x: 10, y: 20 }]]);
    expect(glidePositions(new Map(), to, 0).get(b)).toEqual({ x: 10, y: 20 });
  });
});
