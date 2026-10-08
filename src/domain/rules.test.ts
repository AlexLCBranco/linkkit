import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "./ids";
import {
  boxDeleteRefusal,
  canAddNextStep,
  canDeleteBox,
  canDeleteLink,
  canLink,
  canPaste,
  levelOf,
  linkDeleteRefusal,
  linkRefusalText,
  nextStepRefusal,
} from "./rules";
import { build, buildTree, ids } from "./testMaps";

const a = asNodeId("a");
const b = asNodeId("b");

describe("canLink (connections)", () => {
  it("allows an arrow between two boxes", () => {
    expect(canLink(build(["a", "b"]), a, b)).toEqual({ ok: true });
  });

  it("refuses a box needing itself", () => {
    expect(canLink(build(["a"]), a, a)).toEqual({ ok: false, reason: "self" });
  });

  it("refuses an exact repeat but allows the reverse arrow (a loop)", () => {
    const map = build(["a", "b"], [["a", "b"]]);
    expect(canLink(map, a, b)).toEqual({ ok: false, reason: "duplicate" });
    expect(canLink(map, b, a)).toEqual({ ok: true });
  });

  it("refuses an arrow to a box that does not exist", () => {
    expect(canLink(build(["a"]), a, b)).toEqual({ ok: false, reason: "missing" });
  });
});

describe("deleting (connections)", () => {
  it("allows deleting any box or arrow", () => {
    const map = build(["a", "b"], [["a", "b"]]);
    expect(canDeleteBox(map, a)).toBe(true);
    expect(canDeleteLink(map, asLinkId("a>b"))).toBe(true);
  });
});

describe("canPaste", () => {
  it("lets copied boxes into a connections map, never into a tree", () => {
    const map = build(["a"]);
    expect(canPaste(map)).toBe(true);
    expect(canPaste({ ...map, kind: "tree" })).toBe(false);
  });
});

describe("linked trees (a tree shared with a Boardkit board)", () => {
  // s = start (the board), l1 / l2 = lists, c = a card in l1.
  const tree = buildTree("s", ["l1", "l2", "c"], [
    ["s", "l1"],
    ["s", "l2"],
    ["l1", "c"],
  ]);
  const linked = { ...tree, linkedBoard: "s" };
  const [s, l1, l2, c] = ids("s", "l1", "l2", "c");

  it("counts levels from the start", () => {
    expect([s, l1, c].map((id) => levelOf(linked, id))).toEqual([1, 2, 3]);
  });

  it("has no level for a box with two ways in", () => {
    const twice = { ...tree, links: { ...tree.links, x: { id: asLinkId("x"), from: l2, to: c, label: "" } } };
    expect(levelOf(twice, c)).toBeNull();
  });

  it("lets the board and its lists have next steps, never a card", () => {
    expect(canAddNextStep(linked, s)).toBe(true);
    expect(canAddNextStep(linked, l1)).toBe(true);
    expect(canAddNextStep(linked, c)).toBe(false);
    expect(nextStepRefusal(linked, c)).toBe("“c” is a card, and cards can't have children in Boardkit.");
    expect(nextStepRefusal(linked, l1)).toBeNull();
  });

  it("refuses a second way into a box", () => {
    expect(canLink(linked, l2, c)).toEqual({ ok: false, reason: "two-ways-in" });
    // The same arrow is fine in an unlinked tree.
    expect(canLink(tree, l2, c)).toEqual({ ok: true });
  });

  it("keeps the tree rules underneath", () => {
    expect(canLink(linked, c, s)).toEqual({ ok: false, reason: "start" });
    expect(canDeleteBox(linked, s)).toBe(false);
    expect(canDeleteBox(linked, c)).toBe(true);
  });

  it("leaves unlinked trees and connections maps as they were", () => {
    expect(canAddNextStep(tree, c)).toBe(true);
    expect(canAddNextStep(build(["a"]), a)).toBe(false);
  });
});

describe("refusal texts", () => {
  it("says why a tree arrow can't be deleted, and nothing for one that can", () => {
    const t = buildTree("s", ["a", "b"], [["s", "a"], ["s", "b"], ["a", "b"]]);
    expect(linkDeleteRefusal(t, asLinkId("s>a"))).toMatch(/every box needs a parent/);
    expect(linkDeleteRefusal(t, asLinkId("a>b"))).toBeNull();
    expect(linkDeleteRefusal(build(["a", "b"], [["a", "b"]]), asLinkId("a>b"))).toBeNull();
  });

  it("names the start when it can't be deleted", () => {
    const t = buildTree("s", ["a"], [["s", "a"]]);
    expect(boxDeleteRefusal(t, asNodeId("s"))).toMatch(/“s” is the start/);
    expect(boxDeleteRefusal(t, asNodeId("a"))).toBeNull();
  });

  it("says why an arrow is refused", () => {
    const t = buildTree("s", ["a"], [["s", "a"]]);
    const verdict = canLink(t, asNodeId("a"), asNodeId("s"));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(linkRefusalText(t, asNodeId("a"), asNodeId("s"), verdict.reason)).toMatch(/is the start/);
  });
});
