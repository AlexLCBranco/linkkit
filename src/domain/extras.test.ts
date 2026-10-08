import { describe, expect, it } from "vitest";

import { readBackup, serializeBackup } from "./backup";
import { boardToTree, treeToBoard, viewOf, EMPTY_BOARD } from "./bridge";
import { asNodeId } from "./ids";
import { moveNode, renameNode, setNodeColor } from "./map";
import { mergeMaps, sameMap } from "./merge";
import { readMap, serializeMap } from "./persistence";
import { build, buildTree } from "./testMaps";
import { trashBoxes } from "./trash";
import type { LinkMap } from "./types";

const PAGE = { width: 800, height: 600 };
const id = asNodeId;
const roundTrip = (map: LinkMap): LinkMap => {
  const read = readMap(JSON.parse(JSON.stringify(serializeMap(map, 1))), PAGE);
  if (read.status === "unreadable") throw new Error("unreadable");
  return read.map;
};
type Loose = Record<string, unknown>;
const loose = (x: object) => x as Loose;

/** A map as a newer Linkkit might save it: a field this build doesn't know
    on the map, a box, an arrow and a trash entry. */
function fromTheFuture(): LinkMap {
  let map = build(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
  map = trashBoxes(map, [id("c")], 5);
  const data = JSON.parse(JSON.stringify(serializeMap(map, 1)));
  data.map.theme = "sepia";
  data.map.nodes.a.shape = "round";
  data.map.links["a>b"].weight = 3;
  data.map.trash[0].reason = "tidy";
  data.map.trash[0].nodes[0].shape = "pill";
  const read = readMap(data, PAGE);
  if (read.status !== "ok") throw new Error(read.status);
  return read.map;
}

describe("fields this build doesn't know", () => {
  it("are read without counting as damage, and saved back as they were", () => {
    const map = roundTrip(fromTheFuture());
    expect(loose(map).theme).toBe("sepia");
    expect(loose(map.nodes[id("a")]).shape).toBe("round");
    expect(loose(map.links["a>b" as never]).weight).toBe(3);
    expect(loose(map.trash[0]).reason).toBe("tidy");
    expect(loose(map.trash[0].nodes[0]).shape).toBe("pill");
  });

  it("survive this build's edits to the same records", () => {
    let map = fromTheFuture();
    map = renameNode(moveNode(setNodeColor(map, id("a"), "red"), id("a"), { x: 9, y: 9 }), id("a"), "A");
    const back = roundTrip(map);
    expect(loose(back.nodes[id("a")]).shape).toBe("round");
    expect(loose(back).theme).toBe("sepia");
  });

  it("go into Export all maps and come back from it", () => {
    const read = readBackup(JSON.parse(JSON.stringify(serializeBackup([fromTheFuture()], new Date(0)))), PAGE);
    expect(read.status === "ok" && loose(read.maps[0]).theme).toBe("sepia");
  });

  it("make two maps different, and merge like a setting", () => {
    const base = fromTheFuture();
    const changed = { ...base, theme: "night" } as LinkMap;
    expect(sameMap(base, changed)).toBe(false);
    // Changed in the other tab only: theirs. Here only: mine. Both: theirs, named.
    expect(loose(mergeMaps(base, base, changed).map).theme).toBe("night");
    expect(loose(mergeMaps(base, changed, renameNode(base, id("b"), "B")).map).theme).toBe("night");
    const clash = mergeMaps(base, changed, { ...base, theme: "day" } as LinkMap);
    expect(loose(clash.map).theme).toBe("day");
    expect(clash.conflicts).toHaveLength(1);
  });

  it("ride along in a linked tree's own part, never into Boardkit's board", () => {
    let tree = buildTree("s", ["l", "c"], [["s", "l"], ["l", "c"]]);
    tree = { ...tree, theme: "sepia", nodes: { ...tree.nodes, [id("c")]: { ...tree.nodes[id("c")], shape: "round" } } } as LinkMap;
    const written = treeToBoard(EMPTY_BOARD, { ...tree, linkedBoard: "s" }, 0);
    if (!written.ok) throw new Error("refused");
    expect(JSON.stringify(written.board)).not.toContain("round");
    const { map } = boardToTree("s", "S", written.board, viewOf(tree));
    expect(loose(map).theme).toBe("sepia");
    expect(loose(map.nodes[id("c")]).shape).toBe("round");
  });
});
