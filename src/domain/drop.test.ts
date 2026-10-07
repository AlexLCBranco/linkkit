import { describe, expect, it } from "vitest";

import { dropSlotAt, mostCovered, type SiblingRow } from "./drop";
import { asNodeId } from "./ids";
import type { NodeId } from "./types";

const n = asNodeId;
const options = { reach: 32, minGap: 24 };
const box = (x: number, y: number) => ({ center: { x, y }, size: { width: 80, height: 40 } });

// Three steps of "p" in a row at y 100: edges 60-140, 160-240, 260-340.
const row: SiblingRow = {
  parent: n("p"),
  siblings: [
    { id: n("a"), box: box(100, 100) },
    { id: n("b"), box: box(200, 100) },
    { id: n("c"), box: box(300, 100) },
  ],
};

describe("dropSlotAt", () => {
  it("finds the gap between two siblings, with its bar", () => {
    expect(dropSlotAt({ x: 150, y: 100 }, [row], "TB", options)).toEqual({
      parent: n("p"),
      before: n("b"),
      bar: { from: { x: 150, y: 80 }, to: { x: 150, y: 120 } },
    });
  });

  it("finds just before the first and after the last", () => {
    expect(dropSlotAt({ x: 40, y: 100 }, [row], "TB", options)?.before).toBe(n("a"));
    expect(dropSlotAt({ x: 360, y: 100 }, [row], "TB", options)?.before).toBeNull();
  });

  it("finds nothing over a box, above the row or too far out", () => {
    expect(dropSlotAt({ x: 100, y: 100 }, [row], "TB", options)).toBeNull();
    expect(dropSlotAt({ x: 150, y: 60 }, [row], "TB", options)).toBeNull();
    expect(dropSlotAt({ x: 400, y: 100 }, [row], "TB", options)).toBeNull();
  });

  it("widens a gap too narrow to aim at", () => {
    const tight: SiblingRow = {
      parent: n("p"),
      siblings: [
        { id: n("a"), box: box(100, 100) },
        { id: n("b"), box: box(182, 100) },
      ],
    };
    // The siblings are 2px apart; the slot is minGap wide round the middle.
    expect(dropSlotAt({ x: 151, y: 100 }, [tight], "TB", options)?.before).toBe(n("b"));
  });

  it("picks the nearer bar where two parents' rows meet", () => {
    const next: SiblingRow = { parent: n("q"), siblings: [{ id: n("d"), box: box(420, 100) }] };
    // Between c (right edge 340) and d (left edge 380): p's "after c" and
    // q's "before d" slots overlap.
    expect(dropSlotAt({ x: 350, y: 100 }, [row, next], "TB", options)).toMatchObject({ parent: n("p"), before: null });
    expect(dropSlotAt({ x: 372, y: 100 }, [row, next], "TB", options)).toMatchObject({ parent: n("q"), before: n("d") });
  });

  it("works sideways in a left-right tree", () => {
    const column: SiblingRow = {
      parent: n("p"),
      siblings: [
        { id: n("a"), box: box(100, 100) },
        { id: n("b"), box: box(100, 200) },
      ],
    };
    // Boxes 80 wide, 40 tall: the gap runs from y 120 to 180.
    expect(dropSlotAt({ x: 100, y: 150 }, [column], "LR", options)).toEqual({
      parent: n("p"),
      before: n("b"),
      bar: { from: { x: 60, y: 150 }, to: { x: 140, y: 150 } },
    });
  });
});

describe("mostCovered", () => {
  const box = (x: number, y: number) => ({ center: { x, y }, size: { width: 100, height: 40 } });
  const boxes: [NodeId, ReturnType<typeof box>][] = [
    [asNodeId("a"), box(0, 0)],
    [asNodeId("b"), box(90, 0)],
  ];

  it("picks the box the dragged box covers most", () => {
    expect(mostCovered(box(70, 5), boxes, 0.35)).toBe("b");
    expect(mostCovered(box(20, 5), boxes, 0.35)).toBe("a");
  });

  it("picks none when it only grazes a box", () => {
    expect(mostCovered(box(0, 36), boxes, 0.35)).toBeNull();
    expect(mostCovered(box(300, 0), boxes, 0.35)).toBeNull();
  });
});
