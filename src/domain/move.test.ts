import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "./ids";
import { nextSteps } from "./order";
import { canMove, moveRefusalText } from "./rules";
import { build, buildTree } from "./testMaps";
import { moveToParent } from "./tree";

const n = asNodeId;

// s -> a -> (a1, a2), s -> b -> b1
const tree = buildTree(
  "s",
  ["a", "b", "a1", "a2", "b1"],
  [
    ["s", "a"],
    ["s", "b"],
    ["a", "a1", "if yes"],
    ["a", "a2"],
    ["b", "b1"],
  ],
);

describe("canMove (tree)", () => {
  it("lets a box go under any box outside its own branch", () => {
    expect(canMove(tree, n("a1"), n("b"))).toEqual({ ok: true });
    expect(canMove(tree, n("a1"), n("b1"))).toEqual({ ok: true });
    expect(canMove(tree, n("a"), n("b1"))).toEqual({ ok: true });
  });

  it("refuses the start, itself and its own branch", () => {
    expect(canMove(tree, n("s"), n("a"))).toEqual({ ok: false, reason: "start" });
    expect(canMove(tree, n("a"), n("a"))).toEqual({ ok: false, reason: "self" });
    expect(canMove(tree, n("a"), n("a2"))).toEqual({ ok: false, reason: "inside" });
  });

  it("lets a box with two ways in be reordered under either, but not moved elsewhere", () => {
    const two = buildTree("s", ["a", "b", "c", "d"], [
      ["s", "a"],
      ["s", "b"],
      ["a", "c"],
      ["b", "c"],
      ["s", "d"],
    ]);
    expect(canMove(two, n("c"), n("a"))).toEqual({ ok: true });
    expect(canMove(two, n("c"), n("b"))).toEqual({ ok: true });
    expect(canMove(two, n("c"), n("d"))).toEqual({ ok: false, reason: "two-ways-in" });
  });

  it("never moves in a connections map", () => {
    const map = build(["a", "b"]);
    expect(canMove(map, n("a"), n("b"))).toEqual({ ok: false, reason: "not-tree" });
  });
});

describe("canMove (linked tree)", () => {
  const linked = { ...tree, linkedBoard: "s" };

  it("moves a card to another list, never a level up or down", () => {
    expect(canMove(linked, n("a1"), n("b"))).toEqual({ ok: true });
    expect(canMove(linked, n("a1"), n("a"))).toEqual({ ok: true });
    expect(canMove(linked, n("a1"), n("s"))).toEqual({ ok: false, reason: "level" });
    expect(canMove(linked, n("a1"), n("b1"))).toEqual({ ok: false, reason: "level" });
    expect(canMove(linked, n("a"), n("b"))).toEqual({ ok: false, reason: "level" });
    expect(canMove(linked, n("a"), n("s"))).toEqual({ ok: true });
  });

  it("refuses a card into a full list, but reorders inside one", () => {
    let full = linked;
    for (let i = 0; i < 49; i++) {
      const id = n(`x${i}`);
      const link = asLinkId(`b>x${i}`);
      full = {
        ...full,
        nodes: { ...full.nodes, [id]: { ...full.nodes[n("b1")], id, name: `x${i}` } },
        links: { ...full.links, [link]: { id: link, from: n("b"), to: id, label: "" } },
      };
    }
    expect(nextSteps(full, n("b"))).toHaveLength(50);
    expect(canMove(full, n("a1"), n("b"))).toEqual({ ok: false, reason: "full" });
    expect(canMove(full, n("b1"), n("b"))).toEqual({ ok: true });
  });

  it("says why in words", () => {
    expect(moveRefusalText(linked, n("a1"), n("b1"), "level")).toBe(
      "“b1” is a card, and cards can't have children in Boardkit.",
    );
    expect(moveRefusalText(linked, n("a1"), n("s"), "level")).toBe("“a1” is a card in Boardkit: it can only go into a list.");
    expect(moveRefusalText(linked, n("a"), n("b"), "level")).toBe("“a” is a list in Boardkit: lists can only be reordered.");
    expect(moveRefusalText(tree, n("a"), n("a2"), "inside")).toBe("“a2” is inside the branch you're moving.");
  });
});

describe("moveToParent", () => {
  it("gives the arrow in a new start, keeping its id and label, and the branch follows", () => {
    const moved = moveToParent(tree, n("a"), n("b1"), null);
    expect(moved.links[asLinkId("s>a")]).toEqual({ id: asLinkId("s>a"), from: n("b1"), to: n("a"), label: "" });
    expect(nextSteps(moved, n("s"))).toEqual([n("b")]);
    expect(nextSteps(moved, n("b1"))).toEqual([n("a")]);
    expect(nextSteps(moved, n("a"))).toEqual([n("a1"), n("a2")]);
    const card = moveToParent(tree, n("a1"), n("b"), null);
    expect(card.links[asLinkId("a>a1")].label).toBe("if yes");
  });

  it("puts the box before the sibling named, or last", () => {
    expect(nextSteps(moveToParent(tree, n("a1"), n("b"), n("b1")), n("b"))).toEqual([n("a1"), n("b1")]);
    expect(nextSteps(moveToParent(tree, n("a1"), n("b"), null), n("b"))).toEqual([n("b1"), n("a1")]);
  });

  it("reorders under the same parent", () => {
    const moved = moveToParent(tree, n("a2"), n("a"), n("a1"));
    expect(nextSteps(moved, n("a"))).toEqual([n("a2"), n("a1")]);
    expect(moved.links).toBe(tree.links);
    expect(nextSteps(moveToParent(moved, n("a2"), n("a"), null), n("a"))).toEqual([n("a1"), n("a2")]);
  });

  it("returns the same map when nothing would change", () => {
    expect(moveToParent(tree, n("a2"), n("a"), null)).toBe(tree);
    expect(moveToParent(tree, n("a1"), n("a"), n("a2"))).toBe(tree);
  });

  it("reorders a box with two ways in under one parent, leaving the other alone", () => {
    const two = buildTree("s", ["a", "b", "c", "d"], [
      ["s", "a"],
      ["s", "b"],
      ["a", "d"],
      ["a", "c"],
      ["b", "c"],
    ]);
    const moved = moveToParent(two, n("c"), n("a"), n("d"));
    expect(nextSteps(moved, n("a"))).toEqual([n("c"), n("d")]);
    expect(nextSteps(moved, n("b"))).toEqual([n("c")]);
    expect(moveToParent(two, n("c"), n("s"), null)).toBe(two);
  });
});
