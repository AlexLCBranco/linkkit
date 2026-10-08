import { describe, expect, it } from "vitest";

import { readBackup, serializeBackup } from "./backup";
import { boardToTree, treeToBoard, viewOf, EMPTY_BOARD } from "./bridge";
import { asMapId, asNodeId } from "./ids";
import { duplicateMap, setNodeNotes } from "./map";
import { mergeMaps } from "./merge";
import { readMap, serializeMap } from "./persistence";
import { build, buildTree } from "./testMaps";
import { restoreFromTrash, trashBoxes } from "./trash";
import { withFreshIds } from "./templates";

const id = asNodeId;
const PAGE = { width: 800, height: 600 };
const NOTE = "First line\n\n  second, indented  ";

describe("box notes", () => {
  const map = build(["a", "b"], [["a", "b"]]);

  it("are kept exactly as typed; emptied, the field goes", () => {
    const noted = setNodeNotes(map, id("a"), NOTE);
    expect(noted.nodes[id("a")].notes).toBe(NOTE);
    const cleared = setNodeNotes(noted, id("a"), "");
    expect(Object.hasOwn(cleared.nodes[id("a")], "notes")).toBe(false);
  });

  it("that are only whitespace read back as none", () => {
    const blank = setNodeNotes(map, id("a"), " \n ");
    const read = readMap(JSON.parse(JSON.stringify(serializeMap(blank))), PAGE);
    expect(read.status !== "unreadable" && read.map.nodes[id("a")]).not.toHaveProperty("notes");
  });

  it("returns the same map when nothing changes", () => {
    expect(setNodeNotes(map, id("a"), "")).toBe(map);
    expect(setNodeNotes(map, id("zz"), "x")).toBe(map);
    const noted = setNodeNotes(map, id("a"), "x");
    expect(setNodeNotes(noted, id("a"), "x")).toBe(noted);
  });

  it("survive a save and a reload, and a save from before notes reads unrepaired", () => {
    const noted = setNodeNotes(map, id("a"), NOTE);
    const read = readMap(JSON.parse(JSON.stringify(serializeMap(noted, 3))), PAGE);
    expect(read.status).toBe("ok");
    expect(read.status !== "unreadable" && read.map.nodes[id("a")].notes).toBe(NOTE);
    expect(readMap(JSON.parse(JSON.stringify(serializeMap(map))), PAGE).status).toBe("ok");
  });

  it("are repaired when they aren't text, and an empty one is dropped quietly", () => {
    const data = JSON.parse(JSON.stringify(serializeMap(map)));
    data.map.nodes.a.notes = 42;
    data.map.nodes.b.notes = "";
    const read = readMap(data, PAGE);
    expect(read.status).toBe("repaired");
    expect(read.status !== "unreadable" && read.map.nodes[id("a")]).not.toHaveProperty("notes");
    expect(read.status !== "unreadable" && read.map.nodes[id("b")]).not.toHaveProperty("notes");
  });

  it("go to the trash with their box and come back with it, also through a save", () => {
    const trashed = trashBoxes(setNodeNotes(map, id("b"), NOTE), [id("b")], 1);
    const saved = readMap(JSON.parse(JSON.stringify(serializeMap(trashed))), PAGE);
    if (saved.status === "unreadable") throw new Error("unreadable");
    expect(saved.map.trash[0].nodes[0].notes).toBe(NOTE);
    expect(restoreFromTrash(saved.map, id("b")).nodes[id("b")].notes).toBe(NOTE);
  });

  it("go into an exported file and back (Export all maps, backups, restore)", () => {
    const noted = setNodeNotes(map, id("a"), NOTE);
    const read = readBackup(JSON.parse(JSON.stringify(serializeBackup([noted], new Date(0)))), PAGE);
    expect(read.status === "ok" && read.maps[0].nodes[id("a")].notes).toBe(NOTE);
  });

  it("go with a duplicated map and a template's fresh copy", () => {
    const noted = setNodeNotes(map, id("a"), NOTE);
    expect(duplicateMap(noted, asMapId("m2"), "Copy").nodes[id("a")].notes).toBe(NOTE);
    const fresh = withFreshIds(noted, asMapId("m3"), "T");
    expect(Object.values(fresh.nodes).map((n) => n.notes ?? "")).toContain(NOTE);
  });

  it("merge per box with another tab's edits like any other field", () => {
    const mine = setNodeNotes(map, id("a"), "mine");
    const theirs = setNodeNotes(map, id("b"), "theirs");
    const merged = mergeMaps(map, mine, theirs);
    expect(merged.conflicts).toEqual([]);
    expect(merged.map.nodes[id("a")].notes).toBe("mine");
    expect(merged.map.nodes[id("b")].notes).toBe("theirs");

    // Both tabs wrote the same box's notes: theirs is kept, and named.
    const clash = mergeMaps(map, mine, setNodeNotes(map, id("a"), "theirs"));
    expect(clash.map.nodes[id("a")].notes).toBe("theirs");
    expect(clash.conflicts).toHaveLength(1);

    // Cleared here, untouched there: cleared.
    const noted = setNodeNotes(map, id("a"), "x");
    const cleared = mergeMaps(noted, setNodeNotes(noted, id("a"), ""), noted);
    expect(cleared.map.nodes[id("a")]).not.toHaveProperty("notes");
  });

  it("stay with a linked tree's boxes as Linkkit's own part, which Boardkit never gets", () => {
    const tree = setNodeNotes(buildTree("s", ["l", "c"], [["s", "l"], ["l", "c"]]), id("c"), NOTE);
    const written = treeToBoard(EMPTY_BOARD, { ...tree, linkedBoard: "s" }, 0);
    if (!written.ok) throw new Error("refused");
    expect(JSON.stringify(written.board)).not.toContain("second, indented");
    const { map } = boardToTree("s", "S", written.board, viewOf(tree));
    expect(map.nodes[id("c")].notes).toBe(NOTE);
    expect(map.nodes[id("l")]).not.toHaveProperty("notes");
  });
});
