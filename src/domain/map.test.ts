import { describe, expect, it } from "vitest";

import { asLinkId, asMapId, asNodeId } from "./ids";
import {
  addLink,
  addNode,
  cleanName,
  deleteLink,
  deleteNode,
  duplicateMap,
  moveNode,
  moveNodes,
  renameMap,
  renameNode,
  setLinkLabel,
  setNodeColor,
  setPage,
} from "./map";
import { build } from "./testMaps";

const a = asNodeId("a");
const b = asNodeId("b");
const c = asNodeId("c");

describe("map edits", () => {
  it("adds a box with a tidied name and no colour", () => {
    const { map, nodeId } = addNode(build([]), { x: 10, y: 20 }, "  Big   box ");
    expect(map.nodes[nodeId]).toEqual({ id: nodeId, name: "Big box", x: 10, y: 20, color: null });
  });

  it("renames, moves and recolours, returning the same map when nothing changes", () => {
    const map = build(["a"]);
    expect(renameNode(map, a, " a ")).toBe(map);
    expect(moveNode(map, a, { x: 0, y: 0 })).toBe(map);
    expect(renameNode(map, a, "Alpha").nodes[a].name).toBe("Alpha");
    expect(moveNode(map, a, { x: 5, y: 6 }).nodes[a]).toMatchObject({ x: 5, y: 6 });
    expect(setNodeColor(map, a, "teal").nodes[a].color).toBe("teal");
    expect(renameNode(map, asNodeId("ghost"), "x")).toBe(map);
  });

  it("moves many boxes at once", () => {
    const map = moveNodes(build(["a", "b"]), new Map([[a, { x: 1, y: 2 }], [b, { x: 3, y: 4 }]]));
    expect(map.nodes[b]).toMatchObject({ x: 3, y: 4 });
  });

  it("deletes a box together with every arrow touching it", () => {
    const map = deleteNode(build(["a", "b", "c"], [["a", "b"], ["b", "c"], ["a", "c"]]), b);
    expect(Object.keys(map.nodes)).toEqual(["a", "c"]);
    expect(Object.keys(map.links)).toEqual(["a>c"]);
  });

  it("adds an arrow only when the rules allow it", () => {
    const map = build(["a", "b"], [["a", "b"]]);
    const repeat = addLink(map, a, b);
    expect(repeat.linkId).toBeNull();
    expect(repeat.map).toBe(map);
    const reverse = addLink(map, b, a, "  ");
    expect(reverse.linkId).not.toBeNull();
    expect(reverse.map.links[reverse.linkId!].label).toBe("needs");
  });

  it("puts an emptied arrow label back to 'needs'", () => {
    const map = build(["a", "b"], [["a", "b", "requires"]]);
    const id = asLinkId("a>b");
    expect(map.links[id].label).toBe("requires");
    expect(setLinkLabel(map, id, "  ").links[id].label).toBe("needs");
    expect(deleteLink(map, id).links).toEqual({});
  });

  it("renames the map and resizes the page", () => {
    const map = build(["c"]);
    expect(renameMap(map, "  ")).toBe(map);
    expect(renameMap(map, "Mine").name).toBe("Mine");
    expect(setPage(map, { width: 800, height: 600 })).toBe(map);
    expect(setPage(map, { width: 900, height: 600 }).page.width).toBe(900);
    expect(map.nodes[c]).toBeDefined();
  });

  it("duplicates a map under a new id and name, sharing its content", () => {
    const map = build(["a", "b"], [["a", "b"]]);
    const copy = duplicateMap(map, asMapId("copy"), " Copy ");
    expect(copy).toMatchObject({ id: "copy", name: "Copy", page: map.page });
    expect(copy.nodes).toEqual(map.nodes);
    expect(copy.links).toEqual(map.links);
  });

  it("tidies whitespace in names", () => {
    expect(cleanName(" a \n  b\t")).toBe("a b");
  });
});
