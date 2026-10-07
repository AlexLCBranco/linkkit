import { describe, expect, it } from "vitest";

import { linkTree } from "./bridge";
import { asNodeId } from "./ids";
import { isOutline, parseOutline, pasteOutline } from "./outline";
import { parentsOf } from "./rules";
import { build, buildTree } from "./testMaps";
import type { LinkMap, NodeId } from "./types";

const counter = () => {
  let n = 0;
  return () => asNodeId(`n${++n}`);
};
const named = (map: LinkMap, name: string) => Object.values(map.nodes).find((n) => n.name === name)!.id;
const parentName = (map: LinkMap, name: string) => {
  const [p] = parentsOf(map, named(map, name));
  return p ? map.nodes[p].name : null;
};

describe("parseOutline", () => {
  it("reads depth from tabs or two+ spaces, strips bullets, skips blank lines", () => {
    const text = "- Party\n\n  * Food\n\t• Cake\n    2. Chips\n  Music\nGames\n1) Tidy up";
    expect(parseOutline(text)).toEqual([
      { text: "Party", depth: 0 },
      { text: "Food", depth: 1 },
      { text: "Cake", depth: 2 },
      { text: "Chips", depth: 2 },
      { text: "Music", depth: 1 },
      { text: "Games", depth: 0 },
      { text: "Tidy up", depth: 0 },
    ]);
  });

  it("a one-space indent is still level; a jump of several levels is one child", () => {
    expect(parseOutline("A\n B\n        C").map((l) => l.depth)).toEqual([0, 0, 1]);
  });

  it("a single line is not an outline", () => {
    expect(isOutline("Party")).toBe(false);
    expect(isOutline("Party\n\n")).toBe(false);
    expect(isOutline("Party\nFood")).toBe(true);
  });
});

describe("pasteOutline", () => {
  const outline = parseOutline("Party\n  Food\n    Cake\n    Chips\n  Music\n    Playlist").slice(1);

  it("builds a tree under the start, as next steps in order", () => {
    const t = buildTree("s", []);
    const { map, added } = pasteOutline(t, asNodeId("s"), "Party", outline, { x: 0, y: 0 }, counter());
    expect(added).toHaveLength(5);
    expect(map.nodes[asNodeId("s")].name).toBe("Party");
    expect(parentName(map, "Food")).toBe("Party");
    expect(parentName(map, "Chips")).toBe("Food");
    expect(parentName(map, "Playlist")).toBe("Music");
    expect(map.order[asNodeId("s")]).toEqual([named(map, "Food"), named(map, "Music")]);
  });

  it("puts lines level with the first beside the box (under its parent); the start takes them itself", () => {
    const t = buildTree("s", ["a"], [["s", "a"]]);
    const lines = parseOutline("A\nB\n  C").slice(1);
    const { map } = pasteOutline(t, asNodeId("a"), "A", lines, { x: 0, y: 0 }, counter());
    expect(parentName(map, "B")).toBe("s");
    expect(parentName(map, "C")).toBe("B");
    const fromStart = pasteOutline(t, asNodeId("s"), "S", lines, { x: 0, y: 0 }, counter()).map;
    expect(parentName(fromStart, "B")).toBe("S");
  });

  it("keeps a linked tree three levels deep", () => {
    const linked = linkTree(buildTree("s", ["l"], [["s", "l"]]), () => false, () => asNodeId("x"));
    if (!linked.ok) throw new Error("refused");
    const lines = parseOutline("L\n  Card\n    Too deep").slice(1);
    const { map } = pasteOutline(linked.map, asNodeId("l"), "L", lines, { x: 0, y: 0 }, counter());
    expect(parentName(map, "Card")).toBe("L");
    expect(parentName(map, "Too deep")).toBe("L");
  });

  it("connections: a box needs the box it sits under; a line level with the first stands alone", () => {
    const m = build(["p"]);
    const lines = parseOutline("Party\n  Food\nGames").slice(1);
    const { map, added } = pasteOutline(m, asNodeId("p"), "Party", lines, { x: 0, y: 0 }, counter());
    const links = Object.values(map.links);
    expect(links).toEqual([expect.objectContaining({ from: "p", to: added[0], label: "needs" })]);
    expect(map.nodes[added[1] as NodeId].name).toBe("Games");
  });
});
