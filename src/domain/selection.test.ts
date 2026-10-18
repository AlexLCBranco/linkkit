import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "./ids";
import { asMapId, asPlayerId } from "./ids";
import { createBracket, matchGrid } from "./bracket";
import { bracketDecor } from "./bracketLayout";
import { copyFragment, deleteNodes, fragmentCenter, pasteFragment, pickedMap, setNodesColor } from "./map";
import { looksCut } from "./status";
import { build, buildTree, ids } from "./testMaps";

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

describe("pickedMap (Copy as image of a selection)", () => {
  it("keeps only the picked boxes and the arrows between them, and the map's look", () => {
    const map = { ...build(["a", "b", "c"], [["a", "b", "uses"], ["b", "c"]]), arrowStyle: "elbow" as const };
    const picked = pickedMap(map, ids("a", "b", "zz"));
    expect(Object.keys(picked.nodes)).toEqual(["a", "b"]);
    expect(Object.keys(picked.links)).toEqual(["a>b"]);
    expect(picked.links[asLinkId("a>b")].label).toBe("uses");
    expect(picked).toMatchObject({ id: map.id, kind: map.kind, direction: map.direction, arrowStyle: "elbow" });
  });

  it("a tree without its start: order and folds keep only picked boxes, and nothing breaks", () => {
    let tree = buildTree("s", ["a", "b", "c", "d"], [["s", "a"], ["a", "b"], ["a", "c"], ["c", "d"]]);
    tree = { ...tree, collapsed: ids("s", "c") };
    const picked = pickedMap(tree, ids("a", "b"));
    expect(picked.kind).toBe("tree");
    expect(picked.order).toEqual({ [asNodeId("a")]: ids("b") });
    expect(picked.collapsed).toEqual([]);
    expect(looksCut(picked).size).toBe(0);
  });

  // The image leaves out the round headings and Champion for a selection:
  // worked out from part of a bracket they would be wrong, as shown here.
  it("a bracket without its final keeps its matches and players; its decor would mistake the last round for the final", () => {
    let n = 0;
    let l = 0;
    let p = 0;
    const { map } = createBracket(asMapId("m"), "Cup", { width: 800, height: 600 }, 8, {
      node: () => asNodeId(`n${++n}`),
      link: () => asLinkId(`l${++l}`),
      player: () => asPlayerId(`p${++p}`),
    });
    const firstRound = matchGrid(map)[0];
    const picked = pickedMap(map, firstRound.slice(0, 2));
    expect(Object.keys(picked.nodes)).toHaveLength(2);
    expect(Object.keys(picked.links)).toHaveLength(0);
    expect(picked.players).toBe(map.players);
    const boxes = new Map(
      Object.values(picked.nodes).map((node) => [node.id, { center: { x: node.x, y: node.y }, size: { width: 100, height: 40 } }]),
    );
    expect(bracketDecor(picked, boxes, 16).champion).not.toBeNull();
  });
});
