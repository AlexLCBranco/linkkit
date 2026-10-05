import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "./ids";
import { linkHighlight, nodeHighlight, REACH_MEANINGS, reachCounts, reachOf, walk } from "./reach";
import { build, buildTree, ids } from "./testMaps";

const id = asNodeId;

// app -> sign-in -> account, sign-in -> mfa -> phone
const chain = () =>
  build(
    ["app", "other", "signin", "account", "mfa", "phone", "loner"],
    [
      ["app", "signin"],
      ["other", "signin"],
      ["signin", "account"],
      ["signin", "mfa"],
      ["mfa", "phone"],
    ],
  );

describe("walking the arrows", () => {
  it("follows arrows forward or backward", () => {
    const map = chain();
    expect(walk(map, id("signin"), "forward")).toEqual(new Set(ids("account", "mfa", "phone")));
    expect(walk(map, id("signin"), "backward")).toEqual(new Set(ids("app", "other")));
    expect(walk(map, id("phone"), "backward")).toEqual(new Set(ids("mfa", "signin", "app", "other")));
    expect(walk(map, id("loner"), "forward").size).toBe(0);
  });

  it("is safe in a loop and never counts the selected box itself", () => {
    const map = build(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]);
    expect(walk(map, id("a"), "forward")).toEqual(new Set(ids("b", "c")));
    expect(walk(map, id("a"), "backward")).toEqual(new Set(ids("c", "b")));
  });
});

describe("connections highlight: teal needs, orange breaks", () => {
  it("lights what the box needs teal and what breaks without it orange", () => {
    const reach = reachOf(chain(), id("signin"))!;
    expect(reach.teal).toEqual(new Set(ids("account", "mfa", "phone")));
    expect(reach.orange).toEqual(new Set(ids("app", "other")));
  });

  it("shows a box in both groups as teal, counted once", () => {
    // a <-> b, and x needs a.
    const map = build(["a", "b", "x"], [["a", "b"], ["b", "a"], ["x", "a"]]);
    const reach = reachOf(map, id("a"))!;
    expect(nodeHighlight(reach, id("a"))).toBe("selected");
    expect(nodeHighlight(reach, id("b"))).toBe("teal");
    expect(nodeHighlight(reach, id("x"))).toBe("orange");
    expect(reachCounts(reach)).toEqual({ teal: 1, orange: 1 });
  });

  it("lights arrows on the highlighted paths and fades the rest", () => {
    const map = chain();
    const reach = reachOf(map, id("mfa"))!;
    const look = (key: string) => linkHighlight(reach, map.links[asLinkId(key)]);
    expect(look("mfa>phone")).toBe("teal");
    expect(look("signin>mfa")).toBe("orange");
    expect(look("app>signin")).toBe("orange");
    expect(look("signin>account")).toBe("faded");
    expect(nodeHighlight(reach, id("account"))).toBe("faded");
  });

  it("has no highlight without a (still existing) selection", () => {
    expect(reachOf(chain(), null)).toBeNull();
    expect(reachOf(chain(), id("ghost"))).toBeNull();
  });
});

describe("tree highlight: teal back to the start, orange what comes after", () => {
  // job -> yes -> rent -> near; yes -> buy -> near -> walk; job -> no
  const job = () =>
    buildTree("job", ["yes", "no", "rent", "buy", "near", "walk"], [
      ["job", "yes"],
      ["job", "no"],
      ["yes", "rent"],
      ["yes", "buy"],
      ["rent", "near"],
      ["buy", "near"],
      ["near", "walk"],
    ]);

  it("lights every path back to the start, through both parents", () => {
    const map = job();
    const reach = reachOf(map, id("near"))!;
    expect(reach.teal).toEqual(new Set(ids("rent", "buy", "yes", "job")));
    expect(reach.orange).toEqual(new Set(ids("walk")));
    expect(nodeHighlight(reach, id("no"))).toBe("faded");
    expect(reachCounts(reach)).toEqual({ teal: 4, orange: 1 });
    const look = (key: string) => linkHighlight(reach, map.links[asLinkId(key)]);
    expect(look("rent>near")).toBe("teal");
    expect(look("buy>near")).toBe("teal");
    expect(look("job>yes")).toBe("teal");
    expect(look("near>walk")).toBe("orange");
    expect(look("job>no")).toBe("faded");
  });

  it("from the start, everything comes after it", () => {
    const reach = reachOf(job(), id("job"))!;
    expect(reach.teal.size).toBe(0);
    expect(reachCounts(reach)).toEqual({ teal: 0, orange: 6 });
  });

  it("words its status line for each kind", () => {
    expect(REACH_MEANINGS.tree.tealWords(4)).toBe("Comes from 4");
    expect(REACH_MEANINGS.tree.orangeWords(6)).toBe("Leads to 6");
    expect(REACH_MEANINGS.connections.tealWords(1)).toBe("Needs 1 thing");
    expect(REACH_MEANINGS.connections.orangeWords(2)).toBe("2 things break without it");
  });
});
