import { describe, expect, it } from "vitest";

import { readBackup, serializeBackup } from "./backup";
import { boardToTree, treeToBoard, viewOf, type LinkedView } from "./bridge";
import type { BoardContent } from "./boardRecord";
import { forkBranch } from "./fork";
import { asMapId, asNodeId } from "./ids";
import { duplicateMap, setArrowStyle } from "./map";
import { mergeMaps } from "./merge";
import { fromMermaid, toMermaid } from "./mermaid";
import { readMap, serializeMap, serializeStored } from "./persistence";
import { savedMap, templateOf } from "./templates";
import { build, buildTree } from "./testMaps";

/**
 * The arrow style is a map setting: it goes wherever the map goes (saves,
 * exports, backups, copies, forks, templates, a linked tree's own record)
 * and never to Boardkit or Mermaid.
 */

const page = { width: 800, height: 600 };
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));
const elbowMap = () => setArrowStyle(build(["a", "b"], [["a", "b"]]), "elbow");

describe("the arrow style setting", () => {
  it("is straight on a new map, and changes only when it really changes", () => {
    const map = build(["a"]);
    expect(map.arrowStyle).toBe("straight");
    expect(setArrowStyle(map, "straight")).toBe(map);
    expect(setArrowStyle(map, "elbow").arrowStyle).toBe("elbow");
  });

  it("is saved with the map; an older save reads as straight, a bad one is repaired", () => {
    const map = elbowMap();
    expect(readMap(roundTrip(serializeMap(map)), page)).toEqual({ status: "ok", map });
    expect(readMap(roundTrip(serializeStored(map, 3)), page)).toEqual({ status: "ok", map });
    const old = roundTrip(serializeMap(map));
    delete old.map.arrowStyle;
    expect(readMap(old, page)).toMatchObject({ status: "ok", map: { arrowStyle: "straight" } });
    old.map.arrowStyle = "wavy";
    expect(readMap(old, page)).toMatchObject({ status: "repaired", map: { arrowStyle: "straight" }, fixes: 1 });
  });

  it("goes into Export all maps and backups, and comes back from them", () => {
    const file = roundTrip(serializeBackup([elbowMap()], new Date(0)));
    const read = readBackup(file, page);
    expect(read.status === "ok" && read.maps[0].arrowStyle).toBe("elbow");
  });

  it("is kept by Duplicate, Fork and templates", () => {
    expect(duplicateMap(elbowMap(), asMapId("m2"), "Copy").arrowStyle).toBe("elbow");
    expect(forkBranch(elbowMap(), asNodeId("a"), asMapId("m3"), [])!.arrowStyle).toBe("elbow");
    const template = roundTrip(templateOf(elbowMap(), "t1", 0));
    expect(savedMap(template, page)!.arrowStyle).toBe("elbow");
  });

  it("is merged like any other setting when two tabs save", () => {
    const base = build(["a"]);
    const mine = setArrowStyle(base, "elbow");
    const theirs = { ...base, name: "Renamed" };
    expect(mergeMaps(base, mine, theirs).map).toMatchObject({ arrowStyle: "elbow", name: "Renamed" });
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
    const view: LinkedView = viewOf(setArrowStyle(buildTree("s", ["l1"], [["s", "l1"]]), "elbow"));
    expect(view.arrowStyle).toBe("elbow");
    const tree = boardToTree("s", "S", board, view).map;
    expect(tree.arrowStyle).toBe("elbow");
    // A view kept before there were styles has none: straight.
    const { arrowStyle: _, ...older } = view;
    expect(boardToTree("s", "S", board, older).map.arrowStyle).toBe("straight");
    // What goes to Boardkit carries no trace of it.
    const written = treeToBoard(board, tree, 0);
    expect(written.ok && JSON.stringify(written.board)).not.toContain("elbow");
  });

  it("isn't carried by Mermaid: an import is straight", () => {
    const text = toMermaid(elbowMap());
    expect(text).not.toContain("elbow");
    const read = fromMermaid(text, page);
    expect(read.ok && read.maps[0].arrowStyle).toBe("straight");
  });
});
