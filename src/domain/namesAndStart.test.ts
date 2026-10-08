import { describe, expect, it } from "vitest";

import { boardLosses, linkTree } from "./bridge";
import { asNodeId } from "./ids";
import { cleanBoxName, renameNode, setNodesStatus } from "./map";
import { fromMermaid, toMermaid } from "./mermaid";
import { followBoxName } from "./names";
import { canSetStatus } from "./rules";
import { shownMap } from "./shown";
import { looksCut, cutCount } from "./status";
import { buildTree } from "./testMaps";
import { startOf } from "./tree";
import type { LinkMap } from "./types";

const id = asNodeId;
const PAGE = { width: 900, height: 600 };

// s -> a -> c; s -> b
const tree = (): LinkMap => buildTree("s", ["a", "b", "c"], [["s", "a"], ["s", "b"], ["a", "c"]]);

describe("names over several lines (Shift+Enter)", () => {
  it("keep their line breaks; each line is tidied and blank lines dropped", () => {
    expect(cleanBoxName("  Buy a house \n\n  with a   mortgage ")).toBe("Buy a house\nwith a mortgage");
    expect(renameNode(tree(), id("a"), "Two\nlines").nodes[id("a")].name).toBe("Two\nlines");
  });

  it("go out to Mermaid as <br/> and come back as line breaks", () => {
    const map = renameNode(tree(), id("a"), "Buy a house\nwith a mortgage");
    const text = toMermaid(map);
    expect(text).toContain('["Buy a house<br/>with a mortgage"]');
    const back = fromMermaid(text, PAGE);
    if (!back.ok) throw new Error(back.error);
    expect(Object.values(back.maps[0].nodes).map((n) => n.name)).toContain("Buy a house\nwith a mortgage");
  });

  it("read Treekit's <br/> as a line break", () => {
    const result = fromMermaid('flowchart TD\n  n1["Move?"]\n  n2["Rent<br/>first"]\n  n1 --> n2\n', PAGE);
    if (!result.ok) throw new Error(result.error);
    expect(Object.values(result.maps[0].nodes).map((n) => n.name)).toContain("Rent\nfirst");
  });

  it("give the map a one-line name when it follows its start box", () => {
    const map = { ...tree(), name: "Untitled map" };
    const next = followBoxName(map, renameNode(map, id("s"), "Move\nabroad?"));
    expect(next.name).toBe("Move abroad?");
  });

  it("become one line when the tree is linked to Boardkit (titles are one line)", () => {
    const map = renameNode(tree(), id("a"), "Two\nlines");
    expect(boardLosses(map).multiLine).toBe(1);
    const linked = linkTree(map, () => false, () => id("new"));
    if (!linked.ok) throw new Error("refused");
    expect(linked.map.nodes[id("a")].name).toBe("Two lines");
  });
});

describe("a status on the start (Treekit's root)", () => {
  it("may be set", () => {
    const map = setNodesStatus(tree(), [id("s")], "keep");
    expect(canSetStatus(tree(), id("s"))).toBe(true);
    expect(map.nodes[id("s")].status).toBe("keep");
  });

  it("cut, greys the whole tree and counts as a cut branch", () => {
    const map = setNodesStatus(tree(), [id("s")], "cut");
    expect([...looksCut(map)].sort()).toEqual(["a", "b", "c", "s"]);
    expect(cutCount(map)).toBe(1);
  });

  it("cut with Hide cut on, leaves the start showing (greyed) and hides the rest", () => {
    const map = { ...setNodesStatus(tree(), [id("s")], "cut"), hideCut: true };
    expect(Object.keys(shownMap(map).nodes)).toEqual(["s"]);
  });

  it("comes across from Mermaid without a warning", () => {
    const result = fromMermaid("flowchart TD\n  n1[Move?] --> n2[Rent]\n  class n1 maybe\n", PAGE);
    if (!result.ok) throw new Error(result.error);
    const map = result.maps[0];
    expect(map.nodes[startOf(map)!].status).toBe("maybe");
    expect(result.warnings).toEqual([]);
  });

  it("goes out to Mermaid as its class", () => {
    expect(toMermaid(setNodesStatus(tree(), [id("s")], "keep"))).toMatch(/class n1 keep/);
  });

  it("is not offered in a tree linked to Boardkit (the start is the board), and linking leaves it behind", () => {
    const map = setNodesStatus(tree(), [id("s")], "cut");
    expect(boardLosses(map).startStatus).toBe(true);
    const linked = linkTree(map, () => false, () => id("new"));
    if (!linked.ok) throw new Error("refused");
    expect(linked.map.nodes[id("s")].status).toBeNull();
    expect(canSetStatus(linked.map, id("s"))).toBe(false);
    expect(canSetStatus(linked.map, id("a"))).toBe(true);
  });
});
