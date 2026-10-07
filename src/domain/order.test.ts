import { describe, expect, it } from "vitest";

import { asLinkId, asMapId, asNodeId } from "./ids";
import { layoutMap } from "./layout";
import { addLink, addNode, deleteLink, deleteNode, moveNode } from "./map";
import { nextSteps, normalizeOrder, sameOrder, withNextStep, withoutBoxes, withoutNextStep } from "./order";
import { readMap, serializeMap } from "./persistence";
import { buildTree, build, ids } from "./testMaps";
import { addNextStep, createTree, deleteBranch } from "./tree";
import type { LinkMap, NodeId, SiblingOrder, Size } from "./types";

const id = asNodeId;
const at = { x: 0, y: 0 };
const ord = (order: Record<string, NodeId[]>) => order as SiblingOrder;

/** A tree grown through the real edits: start -> a, b, c (in that order). */
function grown(): LinkMap {
  let map = createTree(asMapId("t"), "T", { width: 800, height: 600 }, "Start", id("s")).map;
  for (const name of ["a", "b", "c"]) map = addNextStep(map, id("s"), at, name, id(name), asLinkId(`s>${name}`))!.map;
  return map;
}

describe("nextSteps", () => {
  it("follows the stored order", () => {
    const map = { ...grown(), order: { [id("s")]: ids("c", "a", "b") } };
    expect(nextSteps(map, id("s"))).toEqual(ids("c", "a", "b"));
  });

  it("trusts only boxes an arrow really leads to, and adds the ones missing", () => {
    const map = { ...grown(), order: { [id("s")]: ids("b", "ghost", "b", "s") } };
    expect(nextSteps(map, id("s"))).toEqual(ids("b", "a", "c"));
  });

  it("falls back to the arrows' creation order", () => {
    expect(nextSteps(buildTree("s", ["x", "y"], [["s", "y"], ["s", "x"]]), id("s"))).toEqual(ids("y", "x"));
  });
});

describe("order edits", () => {
  it("adds, removes and forgets boxes", () => {
    const order = withNextStep({}, id("p"), id("a"));
    expect(withNextStep(order, id("p"), id("a"))).toBe(order);
    expect(withNextStep(order, id("p"), id("b"))).toEqual({ p: ids("a", "b") });
    expect(withoutNextStep(ord({ p: ids("a", "b") }), id("p"), id("a"))).toEqual({ p: ids("b") });
    expect(withoutNextStep(ord({ p: ids("a") }), id("p"), id("a"))).toEqual({});
    expect(withoutBoxes(ord({ p: ids("a", "b"), a: ids("c") }), new Set(ids("a")))).toEqual({ p: ids("b") });
    const same = ord({ p: ids("a") });
    expect(withoutBoxes(same, new Set(ids("z")))).toBe(same);
  });

  it("is kept in step by the tree's edits", () => {
    let map = grown();
    expect(map.order).toEqual({ s: ids("a", "b", "c") });
    // A second way in joins the end of its new parent's list.
    map = addLink(map, id("a"), id("c"), "", asLinkId("a>c")).map;
    expect(map.order).toEqual({ s: ids("a", "b", "c"), a: ids("c") });
    map = deleteLink(map, asLinkId("s>c"));
    expect(map.order).toEqual({ s: ids("a", "b"), a: ids("c") });
    map = deleteBranch(map, id("a"));
    expect(map.order).toEqual({ s: ids("b") });
  });

  it("stays empty in a connections map", () => {
    let map = build(["a", "b"], [["a", "b"]]);
    expect(map.order).toEqual({});
    map = deleteNode(addNode(map, at, "c", id("c")).map, id("b"));
    expect(map.order).toEqual({});
  });
});

describe("normalizeOrder", () => {
  it("lists every box's next steps, placing unlisted ones where they sit", () => {
    let map = buildTree("s", ["a", "b"], [["s", "a"], ["s", "b"]]);
    // As saved before sibling order existed: none stored.
    map = { ...moveNode(moveNode(map, id("a"), { x: 50, y: 0 }), id("b"), { x: -50, y: 9 }), order: {} };
    expect(normalizeOrder(map, "TB")).toEqual({ s: ids("b", "a") });
    expect(normalizeOrder(map, "LR")).toEqual({ s: ids("a", "b") });
  });

  it("compares orders by content", () => {
    expect(sameOrder(ord({ p: ids("a", "b") }), ord({ p: ids("a", "b") }))).toBe(true);
    expect(sameOrder(ord({ p: ids("a", "b") }), ord({ p: ids("b", "a") }))).toBe(false);
    expect(sameOrder(ord({ p: ids("a") }), ord({}))).toBe(false);
  });
});

describe("saving the order", () => {
  const page = { width: 800, height: 600 };
  const roundTrip = (map: LinkMap) => JSON.parse(JSON.stringify(serializeMap(map)));

  it("reads back a tree's order exactly", () => {
    const map = { ...grown(), order: { [id("s")]: ids("c", "a", "b") } };
    expect(readMap(roundTrip(map), page)).toEqual({ status: "ok", map });
  });

  it("gives a tree saved before sibling order the order it shows, without calling it a repair", () => {
    let map = grown();
    map = moveNode(moveNode(moveNode(map, id("a"), { x: 90, y: 0 }), id("b"), { x: -90, y: 0 }), id("c"), { x: 0, y: 0 });
    const saved = roundTrip(map);
    delete saved.map.order;
    const read = readMap(saved, page);
    expect(read.status).toBe("ok");
    expect(read.status !== "unreadable" && read.map.order).toEqual({ s: ids("b", "c", "a") });
  });

  it("repairs a stored order that disagrees with the arrows", () => {
    const saved = roundTrip(grown());
    saved.map.order = { s: ["a", "ghost"], a: "nonsense" };
    const read = readMap(saved, page);
    expect(read.status).toBe("repaired");
    expect(read.status !== "unreadable" && read.map.order).toEqual({ s: ids("a", "b", "c") });
  });
});

describe("Tidy up follows the order", () => {
  const options = { columnGap: 30, rowGap: 70, fallbackSize: { width: 100, height: 36 } };
  const xs = (map: LinkMap) => {
    const p = layoutMap(map, new Map<NodeId, Size>(), options).positions;
    return ids("a", "b", "c").map((n) => p.get(n)!.x);
  };

  it("lines a parent's next steps up in their stored order", () => {
    const [a, b, c] = xs(grown());
    expect(a < b && b < c).toBe(true);
    const [ra, rb, rc] = xs({ ...grown(), order: { [id("s")]: ids("c", "b", "a") } });
    expect(rc < rb && rb < ra).toBe(true);
  });
});
