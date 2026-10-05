import { describe, expect, it } from "vitest";

import { asLinkId, asMapId, asNodeId } from "./ids";
import { canDeleteBox, canDeleteLink, canLink, isStart } from "./rules";
import { addNextStep, branchesOf, branchOf, createTree, deleteBranch, deleteBranches, startOf } from "./tree";
import { buildTree, ids } from "./testMaps";

const id = asNodeId;

// job -> yes -> rent -> near -> walk; yes -> buy -> near; buy -> loan; job -> no
const job = () =>
  buildTree("job", ["yes", "no", "rent", "buy", "near", "walk", "loan"], [
    ["job", "yes"],
    ["job", "no"],
    ["yes", "rent"],
    ["yes", "buy"],
    ["rent", "near"],
    ["buy", "near"],
    ["near", "walk"],
    ["buy", "loan"],
  ]);

describe("a new tree", () => {
  it("is a tree with only its start box, called Start", () => {
    const { map, startId } = createTree(asMapId("t"), "Untitled tree", { width: 800, height: 600 });
    expect(map.kind).toBe("tree");
    expect(Object.keys(map.nodes)).toEqual([startId]);
    expect(map.nodes[startId].name).toBe("Start");
    expect(startOf(map)).toBe(startId);
  });
});

describe("canLink (tree)", () => {
  it("allows a second parent", () => {
    expect(canLink(job(), id("no"), id("near"))).toEqual({ ok: true });
  });

  it("refuses a missing box, a box leading to itself and an exact repeat", () => {
    expect(canLink(job(), id("yes"), id("ghost"))).toEqual({ ok: false, reason: "missing" });
    expect(canLink(job(), id("yes"), id("yes"))).toEqual({ ok: false, reason: "self" });
    expect(canLink(job(), id("job"), id("yes"))).toEqual({ ok: false, reason: "duplicate" });
  });

  it("refuses any arrow into the start", () => {
    expect(canLink(job(), id("walk"), id("job"))).toEqual({ ok: false, reason: "start" });
  });

  it("refuses an arrow that would make a loop, near or far", () => {
    expect(canLink(job(), id("rent"), id("yes"))).toEqual({ ok: false, reason: "loop" });
    expect(canLink(job(), id("walk"), id("buy"))).toEqual({ ok: false, reason: "loop" });
  });
});

describe("deleting in a tree", () => {
  it("never deletes the start", () => {
    expect(isStart(job(), id("job"))).toBe(true);
    expect(canDeleteBox(job(), id("job"))).toBe(false);
    const map = job();
    expect(deleteBranch(map, id("job"))).toBe(map);
  });

  it("hides the × on a box's only way in", () => {
    const map = job();
    expect(canDeleteLink(map, asLinkId("job>yes"))).toBe(false);
    expect(canDeleteLink(map, asLinkId("rent>near"))).toBe(true);
    expect(canDeleteLink(map, asLinkId("buy>near"))).toBe(true);
  });

  it("takes the boxes only reachable through the deleted one", () => {
    expect(branchOf(job(), id("buy"))).toEqual(new Set(ids("buy", "loan")));
    expect(branchOf(job(), id("yes"))).toEqual(new Set(ids("yes", "rent", "buy", "near", "walk", "loan")));
    expect(branchOf(job(), id("walk"))).toEqual(new Set(ids("walk")));
  });

  it("keeps a box another parent still leads to, and what comes after it", () => {
    const map = deleteBranch(job(), id("rent"));
    expect(Object.keys(map.nodes).sort()).toEqual(ids("buy", "job", "loan", "near", "no", "walk", "yes").sort());
    expect(map.links[asLinkId("rent>near")]).toBeUndefined();
    expect(map.links[asLinkId("buy>near")]).toBeDefined();
  });

  it("removes every arrow touching the branch", () => {
    const map = deleteBranch(job(), id("yes"));
    expect(Object.keys(map.links)).toEqual([asLinkId("job>no")]);
  });

  it("deletes several boxes together, with a box both parents led to", () => {
    // "near" has two parents, rent and buy: alone, each leaves it.
    expect(branchesOf(job(), ids("rent", "buy"))).toEqual(new Set(ids("rent", "buy", "near", "walk", "loan")));
    expect(branchesOf(job(), ids("job", "walk"))).toEqual(new Set(ids("walk"))); // never the start
    const map = job();
    expect(deleteBranches(map, ids("job"))).toBe(map);
  });
});

describe("adding a next step", () => {
  it("adds the box and its arrow together, with no label", () => {
    const added = addNextStep(job(), id("no"), { x: 5, y: 6 }, "Stay", id("stay"), asLinkId("no>stay"))!;
    expect(added.map.nodes[id("stay")]).toMatchObject({ name: "Stay", x: 5, y: 6 });
    expect(added.map.links[asLinkId("no>stay")]).toEqual({ id: "no>stay", from: "no", to: "stay", label: "" });
    expect(startOf(added.map)).toBe(id("job"));
  });

  it("does nothing after a box that isn't there", () => {
    expect(addNextStep(job(), id("ghost"), { x: 0, y: 0 })).toBeNull();
  });
});
