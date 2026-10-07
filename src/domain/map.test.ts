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
  reconnectLink,
  relinkCheck,
  renameMap,
  renameNode,
  setArrowLength,
  setLinkLabel,
  setNodeColor,
  setDirection,
  setPage,
} from "./map";
import { build, buildTree } from "./testMaps";

const a = asNodeId("a");
const b = asNodeId("b");
const c = asNodeId("c");

describe("map edits", () => {
  it("adds a box with a tidied name and no colour", () => {
    const { map, nodeId } = addNode(build([]), { x: 10, y: 20 }, "  Big   box ");
    expect(map.nodes[nodeId]).toEqual({ id: nodeId, name: "Big box", x: 10, y: 20, color: null, status: null });
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

  it("switches direction, top-down by default", () => {
    const map = build(["c"]);
    expect(map.direction).toBe("TB");
    expect(setDirection(map, "TB")).toBe(map);
    expect(setDirection(map, "LR").direction).toBe("LR");
  });

  it("sets the arrow length, medium by default", () => {
    const map = build(["c"]);
    expect(map.arrowLength).toBe(47);
    expect(setArrowLength(map, 47.2)).toBe(map);
    expect(setArrowLength(map, 15).arrowLength).toBe(15);
    // Whole pixels, within the range.
    expect(setArrowLength(map, 60.6).arrowLength).toBe(61);
    expect(setArrowLength(map, -20).arrowLength).toBe(0);
    expect(setArrowLength(map, 999).arrowLength).toBe(240);
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

describe("reconnectLink", () => {
  const [a, b, c] = [asNodeId("a"), asNodeId("b"), asNodeId("c")];
  const ab = asLinkId("a>b");

  it("moves either end, keeping the arrow's id and label", () => {
    const m = build(["a", "b", "c"], [["a", "b", "uses"]]);
    const to = reconnectLink(m, ab, "to", c);
    expect(to.verdict.ok).toBe(true);
    expect(to.map.links[ab]).toEqual({ id: ab, from: a, to: c, label: "uses" });
    const from = reconnectLink(m, ab, "from", c);
    expect(from.map.links[ab]).toMatchObject({ from: c, to: b });
  });

  it("refuses an arrow the rules refuse, and changes nothing", () => {
    const m = build(["a", "b", "c"], [["a", "b"], ["a", "c"]]);
    const repeat = reconnectLink(m, ab, "to", c);
    expect(repeat.verdict).toEqual({ ok: false, reason: "duplicate" });
    expect(repeat.map).toBe(m);
    expect(reconnectLink(m, ab, "to", a).verdict).toEqual({ ok: false, reason: "self" });
  });

  it("an end let go where it already was changes nothing", () => {
    const m = build(["a", "b"], [["a", "b"]]);
    expect(reconnectLink(m, ab, "to", b).map).toBe(m);
  });
});

describe("relinkCheck", () => {
  it("connections: same end, a move, a refusal", () => {
    const m = build(["a", "b", "c"], [["a", "b"], ["a", "c"]]);
    const ab = asLinkId("a>b");
    expect(relinkCheck(m, ab, "to", asNodeId("b")).kind).toBe("same");
    expect(relinkCheck(m, ab, "from", asNodeId("c")).kind).toBe("ok");
    expect(relinkCheck(m, ab, "to", asNodeId("c"))).toMatchObject({ kind: "refused", text: expect.stringMatching(/already has/) });
  });

  it("tree: either end moves the child under the box, refused into its own branch", () => {
    const t = buildTree("s", ["a", "b", "c"], [["s", "a"], ["s", "b"], ["a", "c"]]);
    const sa = asLinkId("s>a");
    expect(relinkCheck(t, sa, "to", asNodeId("b")).kind).toBe("ok");
    expect(relinkCheck(t, sa, "from", asNodeId("b")).kind).toBe("ok");
    expect(relinkCheck(t, sa, "from", asNodeId("s")).kind).toBe("same");
    expect(relinkCheck(t, sa, "to", asNodeId("c"))).toMatchObject({ kind: "refused", text: expect.stringMatching(/inside the branch/) });
  });
});
