import { describe, expect, it } from "vitest";

import { asNodeId } from "./ids";
import { setHideCut, setNodesStatus } from "./map";
import { readMap, serializeMap } from "./persistence";
import { canSetStatus } from "./rules";
import { shownMap } from "./shown";
import { cutCount, looksCut } from "./status";
import { build, buildTree, ids } from "./testMaps";
import type { LinkMap, NodeStatus } from "./types";

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

const mark = (map: LinkMap, status: NodeStatus | null, ...names: string[]) => setNodesStatus(map, ids(...names), status);
const sorted = (set: ReadonlySet<string>) => [...set].sort();

describe("canSetStatus", () => {
  it("is for a tree's steps, never its start nor a connections map", () => {
    expect(canSetStatus(job(), id("yes"))).toBe(true);
    expect(canSetStatus(job(), id("job"))).toBe(false);
    expect(canSetStatus(build(["a", "b"], [["a", "b"]]), id("b"))).toBe(false);
  });

  it("is what setNodesStatus follows", () => {
    const map = mark(job(), "cut", "job", "yes");
    expect(map.nodes[id("job")].status).toBeNull();
    expect(map.nodes[id("yes")].status).toBe("cut");
    expect(mark(map, "cut", "yes")).toBe(map);
    expect(mark(map, null, "yes").nodes[id("yes")].status).toBeNull();
  });
});

describe("looksCut", () => {
  it("covers a cut box and everything only it leads to", () => {
    expect(sorted(looksCut(mark(job(), "cut", "buy")))).toEqual(["buy", "loan"]);
    expect(sorted(looksCut(mark(job(), "cut", "yes")))).toEqual(["buy", "loan", "near", "rent", "walk", "yes"]);
  });

  it("keeps a box with two parents alive while one way in is", () => {
    const one = mark(job(), "cut", "rent");
    expect(sorted(looksCut(one))).toEqual(["rent"]);
    expect(sorted(looksCut(mark(one, "cut", "buy")))).toEqual(["buy", "loan", "near", "rent", "walk"]);
  });

  it("ignores keep and maybe, and is empty in a connections map", () => {
    expect(looksCut(mark(job(), "maybe", "yes")).size).toBe(0);
    expect(looksCut(build(["a"])).size).toBe(0);
  });

  it("counts each box cut itself once", () => {
    expect(cutCount(mark(job(), "cut", "yes", "buy"))).toBe(2);
    expect(cutCount(job())).toBe(0);
  });
});

describe("shownMap", () => {
  it("is the map itself unless cut boxes are hidden", () => {
    const map = mark(job(), "cut", "buy");
    expect(shownMap(map)).toBe(map);
    const nothingCut = setHideCut(job(), true);
    expect(shownMap(nothingCut).nodes).toBe(nothingCut.nodes);
  });

  it("leaves out boxes that look cut, with their arrows", () => {
    const map = setHideCut(mark(job(), "cut", "buy"), true);
    const shown = shownMap(map);
    expect(Object.keys(shown.nodes).sort()).toEqual(["job", "near", "no", "rent", "walk", "yes"]);
    expect(Object.keys(shown.links).sort()).toEqual(["job>no", "job>yes", "near>walk", "rent>near", "yes>rent"]);
    expect(shownMap(map)).toBe(shown);
  });
});

describe("saving statuses", () => {
  const page = { width: 800, height: 600 };
  const roundTrip = (map: LinkMap) => JSON.parse(JSON.stringify(serializeMap(map)));

  it("reads back statuses and hide cut exactly", () => {
    const map = setHideCut(mark(mark(job(), "cut", "buy"), "keep", "yes"), true);
    const read = readMap(roundTrip(map), page);
    expect(read.status).toBe("ok");
    expect(read.status !== "unreadable" && read.map.nodes).toEqual(map.nodes);
    expect(read.status !== "unreadable" && read.map.hideCut).toBe(true);
  });

  it("reads saves from before statuses as none, without calling it a repair", () => {
    const saved = roundTrip(job());
    delete saved.map.hideCut;
    for (const node of Object.values(saved.map.nodes) as { status?: unknown }[]) delete node.status;
    const read = readMap(saved, page);
    expect(read.status).toBe("ok");
    expect(read.status !== "unreadable" && read.map.nodes[id("yes")].status).toBeNull();
    expect(read.status !== "unreadable" && read.map.hideCut).toBe(false);
  });

  it("repairs an unknown status, and any status in a connections map", () => {
    const tree = roundTrip(job());
    tree.map.nodes.yes.status = "perhaps";
    expect(readMap(tree, page).status).toBe("repaired");
    const connections = roundTrip(build(["a"]));
    connections.map.nodes.a.status = "cut";
    const read = readMap(connections, page);
    expect(read.status).toBe("repaired");
    expect(read.status !== "unreadable" && read.map.nodes[id("a")].status).toBeNull();
  });
});
