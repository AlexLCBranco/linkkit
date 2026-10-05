import { describe, expect, it } from "vitest";

import { asNodeId } from "./ids";
import { layoutMap } from "./layout";
import { moveNode } from "./map";
import {
  boxBounds,
  clampToPage,
  defaultPageSize,
  freeSpot,
  keepOnPage,
  pageSize,
  placeOnPage,
  visibleCenter,
  type Align,
} from "./page";
import { build } from "./testMaps";
import type { NodeId, Size } from "./types";

const insets = { edge: 14 };
const screen = { width: 800, height: 600 };
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
    expect(clampToPage({ x: 999, y: 999 }, box, page, insets)).toEqual({ x: 336, y: 268 });
    expect(clampToPage({ x: 200, y: 150 }, box, page, insets)).toEqual({ x: 200, y: 150 });
  });

  it("is the screen, or bigger where the boxes reach further", () => {
    const map = moveNode(build(["a"]), asNodeId("a"), { x: 500, y: 400 });
    expect(pageSize(map, noSizes, box, insets, screen)).toEqual(screen);
    expect(pageSize(map, noSizes, box, insets, { width: 320, height: 240 })).toEqual({ width: 564, height: 432 });
    // Leaving the box out: only the screen is left.
    expect(pageSize(map, noSizes, box, insets, { width: 320, height: 240 }, asNodeId("a"))).toEqual({
      width: 320,
      height: 240,
    });
  });

  it("moves a changed box back onto the screen unless other boxes make room past it", () => {
    let map = build(["in", "out", "unmeasured"]);
    map = moveNode(map, asNodeId("in"), { x: 200, y: 200 });
    map = moveNode(map, asNodeId("out"), { x: 790, y: 200 });
    map = moveNode(map, asNodeId("unmeasured"), { x: 300, y: 300 });
    const sizes = new Map<NodeId, Size>([
      [asNodeId("in"), box],
      [asNodeId("out"), box],
    ]);
    const all = [asNodeId("in"), asNodeId("out"), asNodeId("unmeasured")];
    expect(keepOnPage(map, sizes, box, insets, screen, all)).toEqual(new Map([[asNodeId("out"), { x: 736, y: 200 }]]));
    // Only the boxes asked about (the ones that changed size) are checked.
    expect(keepOnPage(map, sizes, box, insets, screen, [asNodeId("in")])).toEqual(new Map());
    // Another box further right (the page already scrolls): "out" stays.
    map = moveNode(map, asNodeId("unmeasured"), { x: 1000, y: 300 });
    expect(keepOnPage(map, sizes, box, insets, screen, all)).toEqual(new Map());
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

  it("centres a layout on the screen, on a bigger page only when needed", () => {
    const map = build(["a", "b", "c"], [["a", "b"], ["a", "c"]]);
    const layout = layoutMap(map, noSizes, { columnGap: 30, rowGap: 70, fallbackSize: box });
    const roomy = placeOnPage(layout, { width: 800, height: 600 }, { x: 50, y: 60 });
    expect(roomy.page).toEqual({ width: 800, height: 600 });
    expect(roomy.positions.get(asNodeId("a"))).toEqual({ x: 400, y: 600 / 2 - 71 + 18 });

    const tight = placeOnPage(layout, { width: 200, height: 100 }, { x: 50, y: 60 });
    expect(tight.page).toEqual({ width: 330, height: 262 });
  });

  it("aligns a layout flush to either edge, margin in from it", () => {
    // 230 wide (two 100s and a 30 gap), 142 tall; "a" is top-centre.
    const map = build(["a", "b", "c"], [["a", "b"], ["a", "c"]]);
    const layout = layoutMap(map, noSizes, { columnGap: 30, rowGap: 70, fallbackSize: box });
    const screen = { width: 800, height: 600 };
    const at = (x: Align, y: Align) => placeOnPage(layout, screen, { x: 50, y: 60 }, { x, y }).positions.get(asNodeId("a"));
    expect(at("start", "start")).toEqual({ x: 50 + 115, y: 60 + 18 });
    expect(at("end", "end")).toEqual({ x: 800 - 50 - 115, y: 600 - 60 - 142 + 18 });
    // With no spare room there is nothing to align in: start and end agree.
    const tight = (x: Align) => placeOnPage(layout, { width: 200, height: 100 }, { x: 50, y: 60 }, { x, y: x });
    expect(tight("end").positions).toEqual(tight("start").positions);
  });

  it("measures the edges of the boxes where they are", () => {
    let map = moveNode(build(["a", "b"]), asNodeId("a"), { x: 100, y: 50 });
    map = moveNode(map, asNodeId("b"), { x: 300, y: 200 });
    const sizes = new Map<NodeId, Size>([[asNodeId("b"), { width: 40, height: 20 }]]);
    expect(boxBounds(map, sizes, box)).toEqual({ left: 50, top: 32, right: 320, bottom: 210 });
    expect(boxBounds(build([]), sizes, box)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });
});
