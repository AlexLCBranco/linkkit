import { describe, expect, it } from "vitest";

import { readBackup, serializeBackup } from "./backup";
import { boardToTree, treeToBoard, viewOf, type LinkedView } from "./bridge";
import type { BoardContent } from "./boardRecord";
import { forkBranch } from "./fork";
import { asMapId, asNodeId } from "./ids";
import { duplicateMap, setArrowStyle, setLabelStyle } from "./map";
import { mergeMaps } from "./merge";
import { fromMermaid, toMermaid } from "./mermaid";
import { readMap, serializeMap, serializeStored } from "./persistence";
import { savedMap, templateOf } from "./templates";
import { build, buildTree } from "./testMaps";

/**
 * The label style is a map setting, set apart from the arrow style: it
 * goes wherever the map goes (saves, exports, backups, copies, forks,
 * templates, a linked tree's own record) and never to Boardkit or Mermaid.
 */

const page = { width: 800, height: 600 };
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));
const treekitMap = () => setLabelStyle(build(["a", "b"], [["a", "b"]]), "treekit");

describe("the label style setting", () => {
  it("is Linkkit's on a new map, and changes only when it really changes", () => {
    const map = build(["a"]);
    expect(map.labelStyle).toBe("linkkit");
    expect(setLabelStyle(map, "linkkit")).toBe(map);
    expect(setLabelStyle(map, "treekit").labelStyle).toBe("treekit");
  });

  it("is set apart from the arrow style: each changes alone", () => {
    const map = setArrowStyle(build(["a"]), "elbow");
    expect(setLabelStyle(map, "treekit")).toMatchObject({ arrowStyle: "elbow", labelStyle: "treekit" });
    expect(setArrowStyle(treekitMap(), "elbow")).toMatchObject({ arrowStyle: "elbow", labelStyle: "treekit" });
    expect(setArrowStyle(treekitMap(), "straight").labelStyle).toBe("treekit");
  });

  it("keeps fields this build doesn't know beside it", () => {
    const saved = roundTrip(serializeMap(treekitMap()));
    saved.map.fromTheFuture = { keep: true };
    const read = readMap(saved, page);
    expect(read.status === "ok" && read.map).toMatchObject({ labelStyle: "treekit" });
    const again = roundTrip(serializeMap((read as { map: ReturnType<typeof treekitMap> }).map));
    expect(again.map).toMatchObject({ labelStyle: "treekit", fromTheFuture: { keep: true } });
  });

  it("is saved with the map; an older save reads as Linkkit's, a bad one is repaired", () => {
    const map = treekitMap();
    expect(readMap(roundTrip(serializeMap(map)), page)).toEqual({ status: "ok", map });
    expect(readMap(roundTrip(serializeStored(map, 3)), page)).toEqual({ status: "ok", map });
    const old = roundTrip(serializeMap(map));
    delete old.map.labelStyle;
    expect(readMap(old, page)).toMatchObject({ status: "ok", map: { labelStyle: "linkkit" } });
    old.map.labelStyle = "fancy";
    expect(readMap(old, page)).toMatchObject({ status: "repaired", map: { labelStyle: "linkkit" }, fixes: 1 });
  });

  it("goes into Export all maps and backups, and comes back from them", () => {
    const file = roundTrip(serializeBackup([treekitMap()], new Date(0)));
    const read = readBackup(file, page);
    expect(read.status === "ok" && read.maps[0].labelStyle).toBe("treekit");
  });

  it("is kept by Duplicate, Fork and templates", () => {
    expect(duplicateMap(treekitMap(), asMapId("m2"), "Copy").labelStyle).toBe("treekit");
    expect(forkBranch(treekitMap(), asNodeId("a"), asMapId("m3"), [])!.labelStyle).toBe("treekit");
    const template = roundTrip(templateOf(treekitMap(), "t1", 0));
    expect(savedMap(template, page)!.labelStyle).toBe("treekit");
  });

  it("is merged like any other setting when two tabs save", () => {
    const base = build(["a"]);
    const mine = setLabelStyle(base, "treekit");
    const theirs = { ...base, name: "Renamed" };
    expect(mergeMaps(base, mine, theirs).map).toMatchObject({ labelStyle: "treekit", name: "Renamed" });
  });

  it("stays Linkkit's own in a linked tree: kept in its view, never put on the board", () => {
    const board: BoardContent = {
      lists: { l1: { id: "l1", title: "L1" } },
      cards: {},
      listOrder: ["l1"],
      cardOrder: { l1: [] },
      trash: [],
      trashedLists: [],
    };
    const view: LinkedView = viewOf(setLabelStyle(buildTree("s", ["l1"], [["s", "l1"]]), "treekit"));
    expect(view.labelStyle).toBe("treekit");
    const tree = boardToTree("s", "S", board, view).map;
    expect(tree.labelStyle).toBe("treekit");
    // A view kept before there were label styles has none: Linkkit's.
    const { labelStyle: _, ...older } = view;
    expect(boardToTree("s", "S", board, older).map.labelStyle).toBe("linkkit");
    // What goes to Boardkit carries no trace of it.
    const written = treeToBoard(board, tree, 0);
    expect(written.ok && JSON.stringify(written.board)).not.toContain("treekit");
  });

  it("isn't carried by Mermaid: an import has Linkkit's", () => {
    const text = toMermaid(treekitMap());
    expect(text).not.toContain("treekit");
    const read = fromMermaid(text, page);
    expect(read.ok && read.maps[0].labelStyle).toBe("linkkit");
  });
});
