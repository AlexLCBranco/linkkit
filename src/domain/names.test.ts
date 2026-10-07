import { describe, expect, it } from "vitest";

import { asNodeId } from "./ids";
import { displayNames, followBoxName, isUntitled, namingBox, numberedName } from "./names";
import { addNode } from "./map";
import { build, buildTree } from "./testMaps";
import type { LinkMap } from "./types";

const named = (map: LinkMap, box: string, name: string): LinkMap => ({
  ...map,
  nodes: { ...map.nodes, [asNodeId(box)]: { ...map.nodes[asNodeId(box)], name } },
});

describe("numberedName / isUntitled", () => {
  it("gives the first free number from 2", () => {
    expect(numberedName("Untitled map", [])).toBe("Untitled map");
    expect(numberedName("Untitled map", ["Untitled map"])).toBe("Untitled map 2");
    expect(numberedName("Untitled map", ["Untitled map", "Untitled map 2", "Untitled map 4"])).toBe("Untitled map 3");
  });

  it("knows every numbered untitled name, and nothing else", () => {
    expect(isUntitled("Untitled map")).toBe(true);
    expect(isUntitled("Untitled map 12")).toBe(true);
    expect(isUntitled("Untitled map 2b")).toBe(false);
    expect(isUntitled("My untitled map")).toBe(false);
  });
});

describe("displayNames", () => {
  it("numbers later repeats only, skipping numbers already in use", () => {
    const shown = displayNames([
      { id: "a", name: "Rent" },
      { id: "b", name: "Rent 2" },
      { id: "c", name: "Rent" },
      { id: "d", name: "Rent" },
      { id: "e", name: "Buy" },
    ]);
    expect([...shown.values()]).toEqual(["Rent", "Rent 2", "Rent 3", "Rent 4", "Buy"]);
  });
});

describe("namingBox", () => {
  it("is a tree's start, else the oldest box, else none", () => {
    expect(namingBox(buildTree("s", ["a"], [["s", "a"]]))).toBe("s");
    expect(namingBox(build(["x", "y"]))).toBe("x");
    expect(namingBox(build([]))).toBeNull();
  });
});

describe("followBoxName", () => {
  const t = (name: string, start: string): LinkMap => named({ ...buildTree("s", ["a"], [["s", "a"]]), name }, "s", start);
  const c = (name: string, first: string): LinkMap => named({ ...build(["f", "g"]), name }, "f", first);

  it("an untitled map, or one still named after its box, follows the box's new name", () => {
    expect(followBoxName(t("Untitled map", "Start"), t("Untitled map", "Party")).name).toBe("Party");
    expect(followBoxName(t("Untitled map 3", "Start"), t("Untitled map 3", "Party")).name).toBe("Party");
    expect(followBoxName(t("Party", "Party"), t("Party", "Big party")).name).toBe("Big party");
    expect(followBoxName(c("Untitled map 2", ""), c("Untitled map 2", "Rent")).name).toBe("Rent");
    expect(followBoxName(c("Rent", "Rent"), c("Rent", "Rent a flat")).name).toBe("Rent a flat");
  });

  it("a fresh map's first box names it as soon as it comes with a name", () => {
    const empty = { ...build([]), name: "Untitled map" };
    expect(followBoxName(empty, addNode(empty, { x: 0, y: 0 }, "Rent").map).name).toBe("Rent");
  });

  it("a name given by hand sticks; a blank box or another box's rename changes nothing", () => {
    const next = t("My plans", "Big party");
    expect(followBoxName(t("My plans", "Party"), next)).toBe(next);
    const blank = t("Party", "");
    expect(followBoxName(t("Party", "Party"), blank)).toBe(blank);
    const other = named(t("Party", "Party"), "a", "x");
    expect(followBoxName(t("Party", "Party"), other)).toBe(other);
    const second = named(c("Untitled map", "Rent"), "g", "Buy");
    expect(followBoxName(c("Untitled map", "Rent"), second)).toBe(second);
  });

  it("an edit that renames the map itself is left alone, and so is a linked map", () => {
    const next = { ...t("Party", "Big party"), name: "Mine" };
    expect(followBoxName(t("Party", "Party"), next)).toBe(next);
    const linked = { ...t("Untitled map", "Party"), linkedBoard: "b" };
    expect(followBoxName({ ...t("Untitled map", "Start"), linkedBoard: "b" }, linked)).toBe(linked);
  });
});
