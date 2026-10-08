import { describe, expect, it } from "vitest";

import type { RouteOptions } from "./arrows";
import { asNodeId } from "./ids";
import { imageLayout } from "./imageLayout";
import type { LabelOptions } from "./labels";
import { moveNode, setArrowStyle, setLabelStyle } from "./map";
import { shownMap } from "./shown";
import { build, buildTree } from "./testMaps";
import type { LinkId, LinkMap, NodeId, Size } from "./types";

/**
 * The exported image draws exactly what the canvas shows: each box at its
 * saved place. It never re-tidies a tree, whatever its arrow or label
 * style (the bug: a tree's image used to be tidied afresh, so boxes the
 * user had dragged came out where Tidy up would put them).
 */

const ROUTES: RouteOptions = {
  arrow: { gap: 5, headLength: 9, headWidth: 9 },
  twinOffset: 7,
  elbow: { corner: 10, minGap: 16, entrySpread: 14, lane: 24, sideGap: 32, stagger: 8 },
};
const LABELS: LabelOptions = { spots: [0.5, 0.35, 0.65], padding: 2 };
const SIZE: Size = { width: 100, height: 40 };
const n = asNodeId;

function layoutOf(map: LinkMap) {
  const shown = shownMap(map);
  const sizes = new Map<NodeId, Size>(Object.keys(shown.nodes).map((id) => [id as NodeId, SIZE]));
  const labels = new Map<LinkId, Size>(
    Object.values(shown.links)
      .filter((l) => l.label)
      .map((l) => [l.id, { width: 40, height: 20 }]),
  );
  return imageLayout(shown, sizes, labels, ROUTES, LABELS, 40);
}

/** Where a box's top-left lands in the image. */
function drawnAt(map: LinkMap, id: string) {
  const layout = layoutOf(map);
  const box = layout.boxes.get(n(id))!;
  return { x: box.center.x - box.size.width / 2 + layout.shift.x, y: box.center.y - box.size.height / 2 + layout.shift.y };
}

// s -> a, s -> b: tidied, then the user drags b far off to the right.
function placedTree() {
  let map = buildTree("s", ["a", "b"], [["s", "a", "if yes"], ["s", "b"]]);
  map = moveNode(map, n("s"), { x: 200, y: 50 });
  map = moveNode(map, n("a"), { x: 100, y: 200 });
  map = moveNode(map, n("b"), { x: 300, y: 200 });
  return map;
}

describe("imageLayout", () => {
  it("draws a box moved in a tree where it was moved to", () => {
    const before = placedTree();
    const moved = moveNode(before, n("b"), { x: 700, y: 400 });
    const layout = layoutOf(moved);
    expect(layout.boxes.get(n("b"))!.center).toEqual({ x: 700, y: 400 });
    // Everything else stays where it was, relative to the box left alone.
    const s = drawnAt(moved, "s");
    const b = drawnAt(moved, "b");
    expect({ x: b.x - s.x, y: b.y - s.y }).toEqual({ x: 500, y: 350 });
    expect(drawnAt(moved, "a")).toEqual(drawnAt(before, "a"));
    // The image grows to take it in.
    expect(layout.width).toBe(Math.ceil(750 - 50 + 80));
  });

  it("ignores the arrow and label styles for where boxes go", () => {
    const moved = moveNode(placedTree(), n("b"), { x: 700, y: 400 });
    const styled = setLabelStyle(setArrowStyle(moved, "elbow"), "treekit");
    expect(layoutOf(styled).boxes).toEqual(layoutOf(moved).boxes);
    expect(layoutOf(styled).routes.size).toBe(2);
  });

  it("draws a map without tree rules where its boxes are, too", () => {
    let map = build(["a", "b"], [["a", "b"]]);
    map = moveNode(map, n("a"), { x: 0, y: 0 });
    map = moveNode(map, n("b"), { x: 300, y: -120 });
    const layout = layoutOf(map);
    expect(layout.boxes.get(n("b"))!.center).toEqual({ x: 300, y: -120 });
    expect(drawnAt(map, "a")).toEqual({ x: 40, y: 40 + 120 });
  });

  it("leaves out boxes that are off the page, as the canvas does", () => {
    const folded = { ...placedTree(), collapsed: [n("s")] };
    expect([...layoutOf(folded).boxes.keys()]).toEqual([n("s")]);
  });
});
