import { describe, expect, it } from "vitest";

import { asLinkId, asMapId, asNodeId } from "./ids";
import { canDeleteBox, canDeleteLink, canLink, isStart } from "./rules";
import { addNextStep, branchesOf, branchOf, createTree, deleteBranch, deleteBranches, repairTree, startOf } from "./tree";
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

describe("repairTree", () => {
  let n = 0;
  const newId = () => asLinkId(`new${++n}`);
  const repair = (map: Parameters<typeof repairTree>[0]) => {
    n = 0;
    return repairTree(map, newId);
  };
  const arrows = (map: Parameters<typeof repairTree>[0]) =>
    Object.values(map.links)
      .map((l) => `${l.from}>${l.to}`)
      .sort();

  it("leaves a whole tree (two parents included) exactly as it is", () => {
    const map = job();
    expect(repair(map)).toEqual({ map, fixes: 0 });
  });

  it("leaves a connections map alone", () => {
    const map = { ...buildTree("a", ["b"], [["b", "a"], ["a", "b"]]), kind: "connections" as const };
    expect(repair(map).fixes).toBe(0);
  });

  it("drops arrows into the start", () => {
    const { map, fixes } = repair(buildTree("job", ["yes"], [["job", "yes"], ["yes", "job"]]));
    // All loop: the oldest box (job) is the start.
    expect(arrows(map)).toEqual(["job>yes"]);
    expect(fixes).toBe(1);
    expect(startOf(map)).toBe(id("job"));
  });

  it("breaks each loop at the arrow that closes it, label and all", () => {
    const { map, fixes } = repair(
      buildTree("job", ["a", "b", "c"], [["job", "a"], ["a", "b"], ["b", "c"], ["c", "a", "again"]]),
    );
    expect(arrows(map)).toEqual(["a>b", "b>c", "job>a"]);
    expect(Object.values(map.links).some((l) => l.label === "again")).toBe(false);
    expect(fixes).toBe(1);
  });

  it("makes a second start (with its branch) and a lone box the start's last next steps", () => {
    const { map, fixes } = repair(
      buildTree("job", ["yes", "other", "after", "lone"], [["job", "yes"], ["other", "after"]]),
    );
    expect(arrows(map)).toEqual(["job>lone", "job>other", "job>yes", "other>after"]);
    expect(map.order[id("job")]).toEqual(ids("yes", "other", "lone"));
    expect(map.links[asLinkId("new1")]).toEqual({ id: asLinkId("new1"), from: id("job"), to: id("other"), label: "" });
    expect(fixes).toBe(2);
  });

  it("starts at the oldest box with no way in, even when an older box is on a loop", () => {
    // a <-> b is a loop with no way in; c is the only real start.
    const { map } = repair(buildTree("a", ["b", "c", "d"], [["a", "b"], ["b", "a"], ["c", "d"]]));
    expect(startOf(map)).toBe(id("c"));
    expect(arrows(map)).toEqual(["a>b", "c>a", "c>d"]);
  });

  it("never deletes a box, and keeps every box where it is", () => {
    const before = buildTree("job", ["a", "b", "lone"], [["a", "b"], ["b", "a"], ["b", "job"]]);
    const { map } = repair(before);
    expect(map.nodes).toBe(before.nodes);
    // A whole tree again: one start, every box reached, nothing to fix.
    expect(repair(map).fixes).toBe(0);
  });

  it("unfolds a collapsed box that is left with no next steps", () => {
    const damaged = { ...buildTree("job", ["a", "b"], [["job", "a"], ["a", "b"], ["b", "a"]]), collapsed: ids("b", "a") };
    expect(repair(damaged).map.collapsed).toEqual(ids("a"));
  });
});

describe("repairTree (order)", () => {
  it("lists attached boxes after the start's own next steps, even with no stored order", () => {
    const damaged = { ...buildTree("job", ["yes", "lone"], [["job", "yes"]]), order: {} };
    expect(repairTree(damaged).map.order[id("job")]).toEqual(ids("yes", "lone"));
  });
});
