import { describe, expect, it } from "vitest";

import { asNodeId } from "./ids";
import { layoutMap } from "./layout";
import { moveNode } from "./map";
import { clampToPage, defaultPageSize, minPageSize, placeOnPage } from "./page";
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
