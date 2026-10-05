import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "./ids";
import { copyFragment, deleteNodes, fragmentCenter, pasteFragment, setNodesColor } from "./map";
import { build, ids } from "./testMaps";

describe("editing several boxes at once", () => {
  it("deletes boxes with every arrow touching them", () => {
    const map = build(["a", "b", "c", "d"], [["a", "b"], ["b", "c"], ["c", "d"]]);
    const next = deleteNodes(map, ids("b", "c"));
    expect(Object.keys(next.nodes)).toEqual(["a", "d"]);
    expect(next.links).toEqual({});
    expect(deleteNodes(map, ids("zz"))).toBe(map);
  });

  it("colours boxes, and changes nothing when they already have it", () => {
    const map = build(["a", "b", "c"]);
    const next = setNodesColor(map, ids("a", "c"), "red");
    expect([next.nodes[asNodeId("a")].color, next.nodes[asNodeId("b")].color, next.nodes[asNodeId("c")].color]).toEqual([
      "red",
      null,
      "red",
    ]);
    expect(setNodesColor(next, ids("a", "c"), "red")).toBe(next);
  });

  it("copies boxes with only the arrows between them", () => {
    const map = build(["a", "b", "c"], [["a", "b", "uses"], ["b", "c"]]);
    const fragment = copyFragment(map, ids("a", "b"));
    expect(fragment.nodes.map((n) => n.id)).toEqual(ids("a", "b"));
    expect(fragment.links.map((l) => l.id)).toEqual([asLinkId("a>b")]);
  });

  it("pastes a copy with new ids, moved, arrows rewired", () => {
    let map = build(["a", "b"], [["a", "b", "uses"]]);
    map = { ...map, nodes: { ...map.nodes, [asNodeId("b")]: { ...map.nodes[asNodeId("b")], x: 100, y: 40 } } };
    const fragment = copyFragment(map, ids("a", "b"));
    expect(fragmentCenter(fragment)).toEqual({ x: 50, y: 20 });
    let n = 0;
    const pasted = pasteFragment(map, fragment, { x: 24, y: 24 }, () => asNodeId(`n${++n}`), () => asLinkId("l1"));
    expect(pasted.nodeIds).toEqual(ids("n1", "n2"));
    expect(pasted.map.nodes[asNodeId("n2")]).toMatchObject({ name: "b", x: 124, y: 64 });
    expect(pasted.map.links[asLinkId("l1")]).toMatchObject({ from: "n1", to: "n2", label: "uses" });
    expect(Object.keys(pasted.map.nodes)).toHaveLength(4);
  });
});
