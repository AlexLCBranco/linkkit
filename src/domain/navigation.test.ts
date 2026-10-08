import { describe, expect, it } from "vitest";

import { asNodeId } from "./ids";
import { arrowToMove, EMPTY_MEMORY, moveFrom, remember, rowsOf, scrollToReveal } from "./navigation";
import { buildTree } from "./testMaps";
import type { LinkMap } from "./types";

const id = asNodeId;

// job -> yes, no; yes -> rent, buy; rent -> near; no -> near (two parents)
function job(): LinkMap {
  const map = buildTree("job", ["yes", "no", "rent", "buy", "near"], [
    ["job", "yes"],
    ["job", "no"],
    ["yes", "rent"],
    ["yes", "buy"],
    ["rent", "near"],
    ["no", "near"],
  ]);
  // Where Tidy up would put them, top-down.
  const at: Record<string, [number, number]> = {
    job: [200, 0], yes: [100, 100], no: [300, 100], rent: [50, 200], buy: [150, 200], near: [175, 300],
  };
  const nodes = Object.fromEntries(Object.entries(map.nodes).map(([k, n]) => [k, { ...n, x: at[k][0], y: at[k][1] }]));
  return { ...map, nodes };
}

describe("arrowToMove", () => {
  it("follows the direction the tree is drawn", () => {
    expect(arrowToMove("ArrowUp", "TB")).toBe("parent");
    expect(arrowToMove("ArrowDown", "TB")).toBe("child");
    expect(arrowToMove("ArrowLeft", "TB")).toBe("prev");
    expect(arrowToMove("ArrowRight", "TB")).toBe("next");
    expect(arrowToMove("ArrowLeft", "LR")).toBe("parent");
    expect(arrowToMove("ArrowRight", "LR")).toBe("child");
    expect(arrowToMove("ArrowUp", "LR")).toBe("prev");
    expect(arrowToMove("ArrowDown", "LR")).toBe("next");
  });
});

describe("moveFrom", () => {
  it("goes up to the parent and nowhere from the start", () => {
    expect(moveFrom(job(), id("rent"), "parent")).toBe("yes");
    expect(moveFrom(job(), id("job"), "parent")).toBeNull();
  });

  it("goes down to the first next step, or the one last visited", () => {
    const map = job();
    expect(moveFrom(map, id("yes"), "child")).toBe("rent");
    const memory = remember(EMPTY_MEMORY, map, id("yes"), id("buy"));
    expect(moveFrom(map, id("yes"), "child", memory)).toBe("buy");
    expect(moveFrom(map, id("buy"), "child")).toBeNull();
  });

  it("walks a whole row in page order, crossing to cousins", () => {
    const map = job();
    expect(moveFrom(map, id("rent"), "next")).toBe("buy");
    expect(moveFrom(map, id("buy"), "prev")).toBe("rent");
    expect(moveFrom(map, id("yes"), "next")).toBe("no");
    expect(moveFrom(map, id("no"), "next")).toBeNull();
    expect(moveFrom(map, id("rent"), "prev")).toBeNull();
  });

  it("goes back up the way it came into a box with two parents", () => {
    const map = job();
    expect(moveFrom(map, id("near"), "parent")).toBe("rent"); // first across the page
    const viaNo = remember(EMPTY_MEMORY, map, id("no"), id("near"));
    expect(moveFrom(map, id("near"), "parent", viaNo)).toBe("no");
  });

  it("puts a box one row below its lowest parent", () => {
    expect(rowsOf(job()).get(id("near"))).toBe(3);
  });

  it("turns with a left-right tree: rows run down the page", () => {
    const map = job();
    const turned = {
      ...map,
      direction: "LR" as const,
      nodes: Object.fromEntries(Object.entries(map.nodes).map(([k, n]) => [k, { ...n, x: n.y, y: n.x }])),
    };
    expect(moveFrom(turned, id("rent"), "next")).toBe("buy");
  });

  it("never lands on a box that isn't showing", () => {
    const map = job();
    const nodes = Object.fromEntries(Object.entries(map.nodes).filter(([k]) => k !== "buy"));
    expect(moveFrom({ ...map, nodes }, id("rent"), "next")).toBeNull();
  });
});

describe("scrollToReveal", () => {
  const view = { left: 0, top: 0, width: 400, height: 300 };
  it("stays put when the box shows", () => {
    expect(scrollToReveal({ x: 200, y: 150 }, { width: 100, height: 40 }, view, 20)).toEqual({ left: 0, top: 0 });
  });
  it("scrolls just enough to show a box past the edge, with the margin", () => {
    expect(scrollToReveal({ x: 500, y: 400 }, { width: 100, height: 40 }, view, 20)).toEqual({ left: 170, top: 140 });
  });
  it("scrolls back to a box before the view", () => {
    expect(scrollToReveal({ x: 100, y: 100 }, { width: 100, height: 40 }, { ...view, left: 300, top: 200 }, 20)).toEqual({
      left: 30,
      top: 60,
    });
  });
});
