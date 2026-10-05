import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "./ids";
import { canDeleteBox, canDeleteLink, canLink, canPaste } from "./rules";
import { build } from "./testMaps";

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
