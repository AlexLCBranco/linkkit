import { describe, expect, it } from "vitest";

import type { BoardContent, BoardItem } from "./boardRecord";
import { boardToTree, treeToBoard, viewOf, type LinkedView } from "./bridge";
import { asNodeId } from "./ids";
import { setNodeUrl } from "./map";
import { mergeMaps } from "./merge";
import { readMap, serializeMap } from "./persistence";
import { build } from "./testMaps";

const id = asNodeId;
const PAGE = { width: 800, height: 600 };

describe("a box's link", () => {
  it("is set, removed, saved and read back", () => {
    const map = setNodeUrl(build(["a", "b"]), id("a"), "https://example.com/a");
    expect(map.nodes[id("a")].url).toBe("https://example.com/a");
    const read = readMap(JSON.parse(JSON.stringify(serializeMap(map))), PAGE);
    expect(read.status !== "unreadable" && read.map.nodes[id("a")].url).toBe("https://example.com/a");
    expect(setNodeUrl(map, id("a"), undefined).nodes[id("a")]).not.toHaveProperty("url");
  });

  it("a stored javascript: or data: link is dropped on load", () => {
    const saved = JSON.parse(JSON.stringify(serializeMap(build(["a", "b"]))));
    saved.map.nodes.a.url = "javascript:alert(1)";
    saved.map.nodes.b.url = "data:text/html,x";
    const read = readMap(saved, PAGE);
    if (read.status === "unreadable") throw new Error("unreadable");
    expect(read.map.nodes[id("a")]).not.toHaveProperty("url");
    expect(read.map.nodes[id("b")]).not.toHaveProperty("url");
  });

  it("another tab's link survives a merge with this tab's other edit", () => {
    const base = build(["a", "b"]);
    const mine = setNodeUrl(base, id("b"), "https://example.com/mine");
    const theirs = setNodeUrl(base, id("a"), "https://example.com/theirs");
    const merged = mergeMaps(base, mine, theirs).map;
    expect(merged.nodes[id("a")].url).toBe("https://example.com/theirs");
    expect(merged.nodes[id("b")].url).toBe("https://example.com/mine");
  });
});

describe("links shared with a linked Boardkit board", () => {
  const item = (key: string, extra: Record<string, unknown> = {}): BoardItem => ({ id: key, title: key, ...extra });
  const board = (): BoardContent => ({
    lists: { l: item("l", { url: "https://example.com/list" }) },
    cards: { c: item("c", { url: "https://example.com/card" }), d: item("d", { url: "javascript:x" }) },
    listOrder: ["l"],
    cardOrder: { l: ["c", "d"] },
    trash: [],
    trashedLists: [],
  });
  const view: LinkedView = { page: PAGE, direction: "TB", arrowLength: 47, hideCut: false, collapsed: [], places: {}, colors: {}, labels: {}, notes: {} };

  it("a list's and a card's box show the item's link (one it wouldn't open is left out)", () => {
    const map = boardToTree("bd", "Board", board(), view).map;
    expect(map.nodes[id("l")].url).toBe("https://example.com/list");
    expect(map.nodes[id("c")].url).toBe("https://example.com/card");
    expect(map.nodes[id("d")]).not.toHaveProperty("url");
  });

  it("a link set or removed on a box goes to its card; the start's stays Linkkit's own", () => {
    const b = board();
    let map = boardToTree("bd", "Board", b, view).map;
    map = setNodeUrl(map, id("c"), undefined);
    map = setNodeUrl(map, id("l"), "https://example.com/new");
    map = setNodeUrl(map, id("bd"), "https://example.com/start");
    const out = treeToBoard(b, map, 0);
    if (!out.ok) throw new Error("refused");
    expect(out.board.cards.c).not.toHaveProperty("url");
    expect(out.board.lists.l.url).toBe("https://example.com/new");
    const again = boardToTree("bd", "Board", out.board, viewOf(map)).map;
    expect(again.nodes[id("bd")].url).toBe("https://example.com/start");
  });
});
