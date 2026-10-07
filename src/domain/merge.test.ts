import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "./ids";
import { addLink, addNode, deleteLink, moveNode, renameMap, renameNode, setCollapsed, setDirection, setNodeColor } from "./map";
import { mergeMaps, movedIds, sameMap, shareUnchanged } from "./merge";
import { nextSteps } from "./order";
import { readMap, revOf, serializeMap } from "./persistence";
import { build, buildTree, ids } from "./testMaps";
import { trashBoxes } from "./trash";
import { addNextStep } from "./tree";
import type { LinkMap } from "./types";

const id = asNodeId;
const names = (map: LinkMap) => Object.values(map.nodes).map((n) => n.name).sort();

describe("movedIds", () => {
  it("finds what was added or moved, not what merely shifted", () => {
    expect(movedIds(["a", "b", "c", "d"], ["a", "c", "d", "b"])).toEqual(new Set(["b"]));
    expect(movedIds(["a", "b"], ["a", "x", "b"])).toEqual(new Set(["x"]));
    expect(movedIds(["a", "b"], ["a", "b"])).toEqual(new Set());
  });
});

describe("mergeMaps", () => {
  const base = build(["a", "b", "c"], [["a", "b"], ["b", "c"]]);

  it("takes theirs when this tab changed nothing, and mine when they changed nothing", () => {
    const theirs = renameNode(base, id("a"), "A");
    expect(mergeMaps(base, base, theirs)).toEqual({ map: theirs, conflicts: [] });
    const mine = renameNode(base, id("b"), "B");
    expect(mergeMaps(base, mine, base)).toEqual({ map: mine, conflicts: [] });
  });

  it("keeps both tabs' changes to different boxes", () => {
    const mine = renameNode(base, id("a"), "A");
    const theirs = setNodeColor(base, id("c"), "teal");
    const { map, conflicts } = mergeMaps(base, mine, theirs);
    expect(map.nodes[id("a")].name).toBe("A");
    expect(map.nodes[id("c")].color).toBe("teal");
    expect(conflicts).toEqual([]);
  });

  it("merges one box field by field: renamed here, moved there keeps both", () => {
    const mine = renameNode(base, id("a"), "A");
    const theirs = moveNode(base, id("a"), { x: 50, y: 70 });
    const { map, conflicts } = mergeMaps(base, mine, theirs);
    expect(map.nodes[id("a")]).toMatchObject({ name: "A", x: 50, y: 70 });
    expect(conflicts).toEqual([]);
  });

  it("keeps theirs and names the box when both changed the same field", () => {
    const mine = renameNode(base, id("a"), "Mine");
    const theirs = renameNode(base, id("a"), "Theirs");
    const { map, conflicts } = mergeMaps(base, mine, theirs);
    expect(map.nodes[id("a")].name).toBe("Theirs");
    expect(conflicts).toEqual([{ kind: "box", title: "Theirs" }]);
  });

  it("is no conflict when both made the same change", () => {
    const mine = renameNode(base, id("a"), "Same");
    const theirs = renameNode(base, id("a"), "Same");
    expect(mergeMaps(base, mine, theirs).conflicts).toEqual([]);
  });

  it("adds boxes and arrows made in either tab", () => {
    const mine = addNode(base, { x: 1, y: 1 }, "mine", id("m")).map;
    const theirs = addNode(base, { x: 2, y: 2 }, "theirs", id("t")).map;
    const theirsLinked = addLink(theirs, id("t"), id("a"), "needs", asLinkId("t>a")).map;
    const { map } = mergeMaps(base, mine, theirsLinked);
    expect(names(map)).toEqual(["a", "b", "c", "mine", "theirs"]);
    expect(map.links[asLinkId("t>a")]).toBeDefined();
  });

  it("deletes here what the other tab left alone", () => {
    const mine = trashBoxes(base, ids("c"), 1);
    const theirs = renameNode(base, id("a"), "A");
    const { map, conflicts } = mergeMaps(base, mine, theirs);
    expect(names(map)).toEqual(["A", "b"]);
    expect(map.links[asLinkId("b>c")]).toBeUndefined();
    expect(map.trash).toHaveLength(1);
    expect(conflicts).toEqual([]);
  });

  it("keeps a box deleted here that the other tab changed, with its arrows, out of the trash", () => {
    const mine = trashBoxes(base, ids("c"), 1);
    const theirs = renameNode(base, id("c"), "C");
    const { map, conflicts } = mergeMaps(base, mine, theirs);
    expect(map.nodes[id("c")].name).toBe("C");
    expect(map.links[asLinkId("b>c")]).toBeDefined();
    expect(map.trash).toEqual([]);
    expect(conflicts).toEqual([{ kind: "box", title: "C" }]);
  });

  it("lets the other tab's delete stand over a change here", () => {
    const mine = renameNode(base, id("c"), "C");
    const theirs = trashBoxes(base, ids("c"), 1);
    const { map, conflicts } = mergeMaps(base, mine, theirs);
    expect(map.nodes[id("c")]).toBeUndefined();
    expect(map.trash).toHaveLength(1);
    expect(conflicts).toEqual([{ kind: "box", title: "C" }]);
  });

  it("drops an arrow drawn here to a box the other tab deleted", () => {
    const mine = addLink(base, id("a"), id("c"), "needs", asLinkId("a>c")).map;
    const theirs = trashBoxes(base, ids("c"), 1);
    const { map } = mergeMaps(base, mine, theirs);
    expect(map.links[asLinkId("a>c")]).toBeUndefined();
    expect(Object.values(map.links).every((l) => map.nodes[l.from] && map.nodes[l.to])).toBe(true);
  });

  it("keeps an arrow drawn in both tabs only once", () => {
    const mine = addLink(base, id("a"), id("c"), "needs", asLinkId("mine")).map;
    const theirs = addLink(base, id("a"), id("c"), "needs", asLinkId("theirs")).map;
    const { map } = mergeMaps(base, mine, theirs);
    expect(Object.values(map.links).filter((l) => l.from === id("a") && l.to === id("c"))).toHaveLength(1);
  });

  it("re-applies an arrow deleted here", () => {
    const mine = deleteLink(base, asLinkId("a>b"));
    const theirs = renameNode(base, id("a"), "A");
    expect(mergeMaps(base, mine, theirs).map.links[asLinkId("a>b")]).toBeUndefined();
  });

  it("merges the map's settings one at a time, naming a clash by the map", () => {
    const mine = setDirection(base, "LR");
    const theirs = renameMap(base, "Theirs");
    expect(mergeMaps(base, mine, theirs).map).toMatchObject({ direction: "LR", name: "Theirs" });
    const clash = mergeMaps(base, renameMap(base, "Mine"), theirs);
    expect(clash.map.name).toBe("Theirs");
    expect(clash.conflicts).toEqual([{ kind: "map", title: "Theirs" }]);
  });

  it("keeps trash entries made in either tab", () => {
    const mine = trashBoxes(base, ids("a"), 1);
    const theirs = trashBoxes(base, ids("c"), 2);
    const { map } = mergeMaps(base, mine, theirs);
    expect(names(map)).toEqual(["b"]);
    expect(map.trash.map((e) => e.nodes[0].id)).toEqual(ids("a", "c"));
  });
});

describe("mergeMaps, trees", () => {
  // s -> a, b, c
  const base = buildTree("s", ["a", "b", "c"], [["s", "a"], ["s", "b"], ["s", "c"]]);

  it("re-applies a reorder next to the same neighbour, keeping the other tab's new step", () => {
    const mine = { ...base, order: { ...base.order, [id("s")]: ids("b", "c", "a") } };
    const theirs = addNextStep(base, id("s"), { x: 0, y: 0 }, "t", id("t"))!.map;
    expect(nextSteps(theirs, id("s"))).toEqual(ids("a", "b", "c", "t"));
    const { map } = mergeMaps(base, mine, theirs);
    expect(nextSteps(map, id("s"))).toEqual(ids("b", "c", "a", "t"));
  });

  it("keeps the other tab's order when both moved the same box", () => {
    const mine = { ...base, order: { ...base.order, [id("s")]: ids("b", "c", "a") } };
    const theirs = { ...base, order: { ...base.order, [id("s")]: ids("b", "a", "c") } };
    expect(nextSteps(mergeMaps(base, mine, theirs).map, id("s"))).toEqual(ids("b", "a", "c"));
  });

  it("puts a tree back into shape when the two tabs together close a loop", () => {
    // s -> a -> b, s -> c. Here: b -> c (c gets a second parent). There:
    // c -> a. Together: a -> b -> c -> a, a loop.
    const tree = buildTree("s", ["a", "b", "c"], [["s", "a"], ["a", "b"], ["s", "c"]]);
    const mine = addLink(tree, id("b"), id("c"), "", asLinkId("b>c")).map;
    const theirs = addLink(tree, id("c"), id("a"), "", asLinkId("c>a")).map;
    const { map } = mergeMaps(tree, mine, theirs);
    expect(readMap(JSON.parse(JSON.stringify(serializeMap(map))), map.page).status).toBe("ok");
  });

  it("attaches a step added here under a box the other tab deleted to the start", () => {
    const mine = addNextStep(base, id("c"), { x: 0, y: 0 }, "n", id("n"))!.map;
    const theirs = trashBoxes(base, ids("c"), 1);
    const { map } = mergeMaps(base, mine, theirs);
    expect(map.nodes[id("n")]).toBeDefined();
    expect(Object.values(map.links).some((l) => l.from === id("s") && l.to === id("n"))).toBe(true);
  });

  it("merges collapse box by box, never as a conflict", () => {
    const tree = buildTree("s", ["a", "b", "x", "y"], [["s", "a"], ["s", "b"], ["a", "x"], ["b", "y"]]);
    const mine = setCollapsed(tree, ids("a"), true);
    const theirs = setCollapsed(tree, ids("b"), true);
    const { map, conflicts } = mergeMaps(tree, mine, theirs);
    expect([...map.collapsed].sort()).toEqual(ids("a", "b"));
    expect(conflicts).toEqual([]);
  });
});

describe("sameMap and shareUnchanged", () => {
  const map = build(["a", "b"], [["a", "b"]]);
  const copy = (m: LinkMap): LinkMap => JSON.parse(JSON.stringify(m));

  it("compares saved content, not objects", () => {
    expect(sameMap(map, copy(map))).toBe(true);
    expect(sameMap(map, renameNode(map, id("a"), "A"))).toBe(false);
  });

  it("reuses every object that didn't change", () => {
    expect(shareUnchanged(map, copy(map))).toBe(map);
    const next = shareUnchanged(map, copy(renameNode(map, id("a"), "A")));
    expect(next.nodes[id("a")].name).toBe("A");
    expect(next.nodes[id("b")]).toBe(map.nodes[id("b")]);
    expect(next.links).toBe(map.links);
  });
});

describe("rev", () => {
  it("is written only when given, and read back as 0 when missing", () => {
    const map = build(["a"]);
    expect(serializeMap(map)).not.toHaveProperty("rev");
    expect(revOf(serializeMap(map, 4))).toBe(4);
    expect(revOf(serializeMap(map))).toBe(0);
    expect(revOf({ rev: -1 })).toBe(0);
    expect(readMap(JSON.parse(JSON.stringify(serializeMap(map, 4))), map.page)).toEqual({ status: "ok", map });
  });
});
