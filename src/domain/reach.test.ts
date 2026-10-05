import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "./ids";
import { breaksOf, linkHighlight, needsOf, nodeHighlight, reachCounts, reachOf } from "./reach";
import { build, ids } from "./testMaps";

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

describe("needs and breaks", () => {
  it("follows arrows forward for needs, backward for breaks", () => {
    const map = chain();
    expect(needsOf(map, id("signin"))).toEqual(new Set(ids("account", "mfa", "phone")));
    expect(breaksOf(map, id("signin"))).toEqual(new Set(ids("app", "other")));
    expect(breaksOf(map, id("phone"))).toEqual(new Set(ids("mfa", "signin", "app", "other")));
    expect(needsOf(map, id("loner")).size).toBe(0);
  });

  it("is safe in a loop and never counts the selected box itself", () => {
    const map = build(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]);
    expect(needsOf(map, id("a"))).toEqual(new Set(ids("b", "c")));
    expect(breaksOf(map, id("a"))).toEqual(new Set(ids("c", "b")));
  });

  it("shows a box both needed and broken as needed, counted once", () => {
    // a <-> b, and x needs a.
    const map = build(["a", "b", "x"], [["a", "b"], ["b", "a"], ["x", "a"]]);
    const reach = reachOf(map, id("a"))!;
    expect(nodeHighlight(reach, id("a"))).toBe("selected");
    expect(nodeHighlight(reach, id("b"))).toBe("need");
    expect(nodeHighlight(reach, id("x"))).toBe("break");
    expect(reachCounts(reach)).toEqual({ needs: 1, breaks: 1 });
  });

  it("lights arrows on the highlighted paths and fades the rest", () => {
    const map = chain();
    const reach = reachOf(map, id("mfa"))!;
    const look = (key: string) => linkHighlight(reach, map.links[asLinkId(key)]);
    expect(look("mfa>phone")).toBe("need");
    expect(look("signin>mfa")).toBe("break");
    expect(look("app>signin")).toBe("break");
    expect(look("signin>account")).toBe("faded");
    expect(nodeHighlight(reach, id("account"))).toBe("faded");
  });

  it("has no highlight without a (still existing) selection", () => {
    expect(reachOf(chain(), null)).toBeNull();
    expect(reachOf(chain(), id("ghost"))).toBeNull();
  });
});
