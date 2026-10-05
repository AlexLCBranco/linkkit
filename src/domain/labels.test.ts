import { describe, expect, it } from "vitest";

import { placeLabels } from "./labels";

const OPTIONS = { spots: [0.5, 0.25, 0.75], padding: 2 };
const size = { width: 40, height: 20 };
const vertical = (id: string, x: number) => ({ id, start: { x, y: 0 }, tip: { x, y: 200 }, size });

describe("placeLabels", () => {
  it("puts a lone label in the middle of its arrow", () => {
    expect(placeLabels([vertical("a", 0)], [], OPTIONS).get("a")).toEqual({ x: 0, y: 100 });
  });

  it("slides a label along its arrow when the middle is taken", () => {
    const spots = placeLabels([vertical("a", 0), vertical("b", 10)], [], OPTIONS);
    expect(spots.get("a")).toEqual({ x: 0, y: 100 });
    expect(spots.get("b")).toEqual({ x: 10, y: 50 });
  });

  it("keeps labels off boxes", () => {
    const box = { center: { x: 0, y: 100 }, size: { width: 100, height: 40 } };
    expect(placeLabels([vertical("a", 0)], [box], OPTIONS).get("a")).toEqual({ x: 0, y: 50 });
  });

  it("stays in the middle when every spot is equally blocked", () => {
    const wall = { center: { x: 0, y: 100 }, size: { width: 100, height: 400 } };
    expect(placeLabels([vertical("a", 0)], [wall], OPTIONS).get("a")).toEqual({ x: 0, y: 100 });
  });

  it("takes the least crowded spot when none is free", () => {
    // Covers the middle fully and the top spot (y = 50) only partly.
    const box = { center: { x: 0, y: 110 }, size: { width: 100, height: 100 } };
    const tall = { ...vertical("a", 0), size: { width: 40, height: 60 } };
    expect(placeLabels([tall], [box], OPTIONS).get("a")).toEqual({ x: 0, y: 50 });
  });
});
