import { describe, expect, it } from "vitest";

import { asLinkId, asMapId, asNodeId } from "./ids";
import { readMap, serializeMap } from "./persistence";
import { build, buildTree, ids } from "./testMaps";
import {
  MAP_TRASH_LIMIT,
  TRASH_LIMIT,
  emptyTrash,
  forgetTrashEntry,
  mapTrashOverflow,
  readMapTrash,
  restoreFromTrash,
  serializeMapTrash,
  summarize,
  trashBoxes,
  trashOverflow,
  withTrashedMap,
  type TrashedMap,
} from "./trash";
import type { LinkMap } from "./types";

const PAGE = { width: 800, height: 600 };
let n = 0;
const newLinkId = () => asLinkId(`new${++n}`);

/** A connections map with `count` loose boxes named b0, b1, ... */
function many(count: number): LinkMap {
  return build(Array.from({ length: count }, (_, i) => `b${i}`));
}

describe("trashBoxes", () => {
  it("keeps the boxes and every arrow touching them as one entry", () => {
    const map = build(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a", "uses"]]);
    const next = trashBoxes(map, ids("b", "c"), 5);
    expect(Object.keys(next.nodes)).toEqual(["a"]);
    expect(next.links).toEqual({});
    expect(next.trash).toEqual([
      { deletedAt: 5, nodes: [map.nodes[asNodeId("b")], map.nodes[asNodeId("c")]], links: Object.values(map.links), places: [] },
    ]);
  });

  it("records where each box sat among its parent's next steps in a tree", () => {
    const tree = buildTree("s", ["a", "b", "c", "d"], [["s", "a"], ["s", "b"], ["s", "c"], ["b", "d"]]);
    const next = trashBoxes(tree, ids("b", "d"), 1);
    expect(next.trash[0].places).toEqual([
      { parent: "s", child: "b", index: 1 },
      { parent: "b", child: "d", index: 0 },
    ]);
    expect(next.order).toEqual({ s: ["a", "c"] });
  });

  it("does nothing for boxes that aren't there", () => {
    const map = build(["a"]);
    expect(trashBoxes(map, ids("x"), 1)).toBe(map);
  });

  it("forgets the oldest deletes once past the limit, and says so first", () => {
    let map = many(TRASH_LIMIT + 5);
    map = trashBoxes(map, ids("b0", "b1"), 1);
    map = trashBoxes(map, ids(...Array.from({ length: TRASH_LIMIT - 2 }, (_, i) => `b${i + 2}`)), 2);
    expect(trashOverflow(map, 0)).toEqual([]);
    const erased = trashOverflow(map, 1);
    expect(summarize(erased)).toEqual({ name: "b0", boxes: 2, deletedAt: 1 });
    map = trashBoxes(map, ids(`b${TRASH_LIMIT}`), 3);
    expect(map.trash.map((e) => e.deletedAt)).toEqual([2, 3]);
  });

  it("keeps the newest delete even when it alone is over the limit", () => {
    const map = trashBoxes(many(TRASH_LIMIT + 1), ids(...Array.from({ length: TRASH_LIMIT + 1 }, (_, i) => `b${i}`)), 1);
    expect(map.trash).toHaveLength(1);
  });
});

describe("restoreFromTrash", () => {
  it("puts boxes and their arrows back as they were", () => {
    const map = build(["a", "b", "c"], [["a", "b", "uses"], ["b", "c"]]);
    const back = restoreFromTrash(trashBoxes(map, ids("b"), 1), asNodeId("b"));
    expect(back).toEqual(map);
  });

  it("leaves out arrows to boxes deleted since, and repeats of arrows drawn since", () => {
    const map = build(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    let next = trashBoxes(map, ids("a"), 1);
    next = trashBoxes(next, ids("c"), 2);
    next = restoreFromTrash(next, asNodeId("a"));
    expect(Object.keys(next.links)).toEqual(["a>b"]);
    expect(next.trash).toHaveLength(1);
  });

  it("gives a restored arrow a new id when its old one is taken", () => {
    const map = build(["a", "b"], [["a", "b"]]);
    let next = trashBoxes(map, ids("b"), 1);
    next = { ...next, links: { [asLinkId("a>b")]: { id: asLinkId("a>b"), from: asNodeId("b"), to: asNodeId("a"), label: "x" } } };
    // (A made-up clash: "b" isn't on the map, so this arrow is dropped, but
    // its id stays taken.)
    next = restoreFromTrash(next, asNodeId("b"), newLinkId);
    expect(Object.values(next.links).filter((l) => l.from === "a" && l.to === "b")).toHaveLength(1);
    expect(next.links[asLinkId("a>b")].label).toBe("x");
  });

  it("puts a tree branch back in its old place among the next steps", () => {
    const tree = buildTree("s", ["a", "b", "c", "d"], [["s", "a"], ["s", "b"], ["s", "c"], ["b", "d"]]);
    const back = restoreFromTrash(trashBoxes(tree, ids("b", "d"), 1), asNodeId("b"));
    expect(back.order).toEqual(tree.order);
    expect(back.links).toEqual(tree.links);
  });

  it("attaches a branch whose parent is gone to the start", () => {
    const tree = buildTree("s", ["a", "b"], [["s", "a"], ["a", "b"]]);
    let next = trashBoxes(tree, ids("b"), 1);
    next = trashBoxes(next, ids("a"), 2);
    next = restoreFromTrash(next, asNodeId("b"), newLinkId);
    expect(Object.values(next.links).map((l) => [l.from, l.to])).toEqual([["s", "b"]]);
    expect(next.order).toEqual({ s: ["b"] });
  });

  it("opens a folded parent so the restored boxes show", () => {
    const tree = buildTree("s", ["a", "b", "c"], [["s", "a"], ["a", "b"], ["a", "c"]]);
    let next = trashBoxes(tree, ids("c"), 1);
    next = { ...next, collapsed: ids("a") };
    expect(restoreFromTrash(next, asNodeId("c")).collapsed).toEqual([]);
  });

  it("is the same map for an entry that isn't there", () => {
    const map = build(["a"]);
    expect(restoreFromTrash(map, asNodeId("a"))).toBe(map);
  });
});

describe("erasing", () => {
  it("forgets one entry, or all of them", () => {
    let map = trashBoxes(build(["a", "b"]), ids("a"), 1);
    map = trashBoxes(map, ids("b"), 2);
    expect(forgetTrashEntry(map, asNodeId("a")).trash.map((e) => e.deletedAt)).toEqual([2]);
    expect(forgetTrashEntry(map, asNodeId("x"))).toBe(map);
    expect(emptyTrash(map).trash).toEqual([]);
    const empty = build(["a"]);
    expect(emptyTrash(empty)).toBe(empty);
  });
});

describe("saving the trash with the map", () => {
  it("reads it back as it was", () => {
    const tree = buildTree("s", ["a", "b"], [["s", "a", "if yes"], ["a", "b"]]);
    const map = trashBoxes({ ...tree, nodes: { ...tree.nodes, [asNodeId("a")]: { ...tree.nodes[asNodeId("a")], status: "maybe" as const } } }, ids("a", "b"), 7);
    expect(readMap(JSON.parse(JSON.stringify(serializeMap(map))), PAGE)).toEqual({ status: "ok", map });
  });

  it("reads a save from before the trash as an empty trash, not damage", () => {
    const { trash: _, ...old } = build(["a"]);
    expect(readMap({ version: 1, map: old }, PAGE)).toMatchObject({ status: "ok", map: { trash: [] } });
  });

  it("drops a damaged entry, or one holding a box that is on the map", () => {
    const map = trashBoxes(build(["a", "b", "c"]), ids("a"), 1);
    const saved = serializeMap(trashBoxes(map, ids("b"), 2));
    const broken = {
      ...saved,
      map: {
        ...saved.map,
        trash: [saved.map.trash[0], { ...saved.map.trash[1], nodes: [{ id: "c", name: "c", x: 0, y: 0, color: null, status: null }] }, { deletedAt: "x" }],
      },
    };
    const read = readMap(JSON.parse(JSON.stringify(broken)), PAGE);
    expect(read).toMatchObject({ status: "repaired", fixes: 2 });
    expect(read.status !== "unreadable" && read.map.trash.map((e) => e.deletedAt)).toEqual([1]);
  });
});

describe("deleted maps", () => {
  const trashed = (i: number): TrashedMap => ({ id: asMapId(`m${i}`), name: `Map ${i}`, boxes: i, deletedAt: i });

  it("warns before the oldest is erased, and erases it past the limit", () => {
    let list: TrashedMap[] = [];
    for (let i = 0; i < MAP_TRASH_LIMIT; i++) list = [...withTrashedMap(list, trashed(i)).trash];
    expect(mapTrashOverflow(list.slice(1))).toBeNull();
    expect(mapTrashOverflow(list)).toEqual(trashed(0));
    const added = withTrashedMap(list, trashed(99));
    expect(added.erased).toEqual([trashed(0)]);
    expect(added.trash).toHaveLength(MAP_TRASH_LIMIT);
  });

  it("saves and reads the list, skipping bad entries", () => {
    const list = [trashed(1), trashed(2)];
    expect(readMapTrash(JSON.parse(JSON.stringify(serializeMapTrash(list))))).toEqual(list);
    expect(readMapTrash({ version: 1, maps: [trashed(1), null, { id: "" }, trashed(1)] })).toEqual([trashed(1)]);
    expect(readMapTrash("nope")).toEqual([]);
  });
});
