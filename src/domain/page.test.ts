import { describe, expect, it } from "vitest";

import { asNodeId } from "./ids";
import { layoutMap } from "./layout";
import { moveNode } from "./map";
import {
  clampToPage,
  defaultPageSize,
  freeSpot,
  keepOnPage,
  minPageSize,
  pageRightEdge,
  pageWidthForRightEdge,
  placeOnPage,
  visibleCenter,
} from "./page";
import { build } from "./testMaps";
import type { NodeId, Size } from "./types";

const insets = { edge: 14, bottomExtra: 10 };
const box = { width: 100, height: 36 };
const noSizes = new Map<NodeId, Size>();

describe("page", () => {
  it("sizes a new page to the window, within limits", () => {
    const options = { minWidth: 360, maxWidth: 980, viewportGutter: 36, height: 560 };
    expect(defaultPageSize(1400, options)).toEqual({ width: 980, height: 560 });
    expect(defaultPageSize(800, options)).toEqual({ width: 764, height: 560 });
    expect(defaultPageSize(300, options)).toEqual({ width: 360, height: 560 });
  });

  it("keeps a whole box on the page", () => {
    const page = { width: 400, height: 300 };
    expect(clampToPage({ x: -50, y: -50 }, box, page, insets)).toEqual({ x: 64, y: 32 });
    expect(clampToPage({ x: 999, y: 999 }, box, page, insets)).toEqual({ x: 336, y: 258 });
    expect(clampToPage({ x: 200, y: 150 }, box, page, insets)).toEqual({ x: 200, y: 150 });
  });

  it("never lets the page shrink past a box or below the floor", () => {
    const map = moveNode(build(["a"]), asNodeId("a"), { x: 500, y: 400 });
    expect(minPageSize(map, noSizes, box, insets, { width: 320, height: 240 })).toEqual({ width: 564, height: 442 });
    expect(minPageSize(build([]), noSizes, box, insets, { width: 320, height: 240 })).toEqual({ width: 320, height: 240 });
  });

  it("moves back only the measured boxes that stick out past the page", () => {
    let map = build(["in", "out", "unmeasured"]);
    map = moveNode(map, asNodeId("in"), { x: 200, y: 200 });
    map = moveNode(map, asNodeId("out"), { x: 790, y: 200 });
    map = moveNode(map, asNodeId("unmeasured"), { x: 5000, y: 5000 });
    const sizes = new Map<NodeId, Size>([
      [asNodeId("in"), box],
      [asNodeId("out"), box],
    ]);
    // build() makes an 800 x 600 page.
    expect(keepOnPage(map, sizes, insets)).toEqual(new Map([[asNodeId("out"), { x: 736, y: 200 }]]));
  });

  it("steps a new box aside until it overlaps no box", () => {
    // a: 100 x 36 at (100, 100); b: unmeasured (the fallback, 100 x 36) at (300, 300).
    let map = moveNode(build(["a", "b"]), asNodeId("a"), { x: 100, y: 100 });
    map = moveNode(map, asNodeId("b"), { x: 300, y: 300 });
    const sizes = new Map<NodeId, Size>([[asNodeId("a"), box]]);
    const options = { step: 24, fallbackSize: box, clearance: 4 };
    expect(freeSpot(map, sizes, { x: 100, y: 200 }, box, options)).toEqual({ x: 100, y: 200 });
    // Overlapping a: 40px clear on y is the first free step (36 + 4 needed).
    expect(freeSpot(map, sizes, { x: 100, y: 100 }, box, options)).toEqual({ x: 148, y: 148 });
    // b is unmeasured: its fallback size still counts.
    expect(freeSpot(map, sizes, { x: 290, y: 310 }, box, options)).toEqual({ x: 338, y: 358 });
  });

  it("finds the middle of the part of the page on screen", () => {
    const page = { left: 100, top: 50, right: 1100, bottom: 1050 };
    // Scrolled so the screen shows page x 0..700 and y 450..950.
    expect(visibleCenter(page, { left: 0, top: 500, right: 800, bottom: 1000 })).toEqual({ x: 350, y: 700 });
    // None of the page on screen: the page's own middle.
    expect(visibleCenter(page, { left: 2000, top: 0, right: 2400, bottom: 400 })).toEqual({ x: 500, y: 500 });
  });

  it("centres a layout on the page, growing the page only when needed", () => {
    const map = build(["a", "b", "c"], [["a", "b"], ["a", "c"]]);
    const layout = layoutMap(map, noSizes, { columnGap: 30, rowGap: 70, fallbackSize: box });
    const roomy = placeOnPage(layout, { width: 800, height: 600 }, { x: 50, y: 60 });
    expect(roomy.page).toEqual({ width: 800, height: 600 });
    expect(roomy.positions.get(asNodeId("a"))).toEqual({ x: 400, y: 600 / 2 - 71 + 18 });

    const tight = placeOnPage(layout, { width: 200, height: 100 }, { x: 50, y: 60 });
    expect(tight.page).toEqual({ width: 330, height: 262 });
  });
});

describe("page right edge (dragging the corner grip)", () => {
  it("a centred page grows on both sides; a wide one only to the right", () => {
    expect(pageRightEdge(600, 1000)).toBe(800);
    expect(pageRightEdge(1000, 1000)).toBe(1000);
    expect(pageRightEdge(1400, 1000)).toBe(1400);
  });

  it("finds the width for an edge, exactly undoing pageRightEdge", () => {
    for (const width of [320, 600, 999, 1000, 1001, 1600]) {
      expect(pageWidthForRightEdge(pageRightEdge(width, 1000), 1000)).toBeCloseTo(width);
    }
    // Moving the edge 10px right widens a centred page by 20px.
    expect(pageWidthForRightEdge(810, 1000) - pageWidthForRightEdge(800, 1000)).toBe(20);
  });
});
