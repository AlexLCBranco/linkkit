import { describe, expect, it } from "vitest";

import { asNodeId } from "./ids";
import { deleteNode, setCollapsed, setHideCut, setNodesStatus } from "./map";
import { readMap, serializeMap } from "./persistence";
import { canCollapse } from "./rules";
import { hiddenAfter, hiddenBoxes, shownMap } from "./shown";
import { build, buildTree, ids } from "./testMaps";
import type { LinkMap } from "./types";

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

const fold = (map: LinkMap, ...names: string[]) => setCollapsed(map, ids(...names), true);
const hidden = (map: LinkMap) => [...hiddenBoxes(map)].sort();

describe("canCollapse", () => {
  it("is for a tree box with next steps", () => {
    expect(canCollapse(job(), id("yes"))).toBe(true);
    expect(canCollapse(job(), id("walk"))).toBe(false);
    expect(canCollapse(build(["a", "b"], [["a", "b"]]), id("a"))).toBe(false);
  });

  it("is what setCollapsed follows; any box may be expanded", () => {
    const map = fold(job(), "yes", "walk");
    expect(map.collapsed).toEqual(ids("yes"));
    expect(fold(map, "yes")).toBe(map);
    expect(setCollapsed(map, ids("yes"), false).collapsed).toEqual([]);
  });
});

describe("collapsing", () => {
  it("folds away every box only reached through the collapsed one", () => {
    const map = fold(job(), "yes");
    expect(hidden(map)).toEqual(["buy", "loan", "near", "rent", "walk"]);
    expect(Object.keys(shownMap(map).nodes).sort()).toEqual(["job", "no", "yes"]);
    expect(hiddenAfter(map, id("yes"))).toBe(5);
  });

  it("keeps a box another parent still shows", () => {
    const map = fold(job(), "buy");
    expect(hidden(map)).toEqual(["loan"]);
    expect(hiddenAfter(map, id("buy"))).toBe(1);
    expect(hidden(fold(map, "rent"))).toEqual(["loan", "near", "walk"]);
  });

  it("adds up with Hide cut", () => {
    const map = setHideCut(fold(setNodesStatus(job(), ids("rent"), "cut"), "buy"), true);
    expect(hidden(map)).toEqual(["loan", "near", "rent", "walk"]);
  });

  it("shows everything with nothing collapsed, as the same map", () => {
    const map = job();
    expect(shownMap(map)).toBe(map);
  });

  it("forgets a deleted box", () => {
    expect(deleteNode(fold(job(), "buy"), id("buy")).collapsed).toEqual([]);
  });
});

describe("saving collapse", () => {
  const page = { width: 800, height: 600 };
  const roundTrip = (map: LinkMap) => JSON.parse(JSON.stringify(serializeMap(map)));

  it("reads it back, and older saves as nothing collapsed", () => {
    const map = fold(job(), "buy");
    const read = readMap(roundTrip(map), page);
    expect(read.status).toBe("ok");
    expect(read.status !== "unreadable" && read.map.collapsed).toEqual(ids("buy"));
    const old = roundTrip(job());
    delete old.map.collapsed;
    const oldRead = readMap(old, page);
    expect(oldRead.status).toBe("ok");
    expect(oldRead.status !== "unreadable" && oldRead.map.collapsed).toEqual([]);
  });

  it("drops a box that isn't there, as a repair", () => {
    const saved = roundTrip(fold(job(), "buy"));
    saved.map.collapsed.push("ghost", 7);
    const read = readMap(saved, page);
    expect(read.status).toBe("repaired");
    expect(read.status !== "unreadable" && read.map.collapsed).toEqual(ids("buy"));
  });
});
