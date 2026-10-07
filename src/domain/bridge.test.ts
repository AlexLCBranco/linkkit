import { describe, expect, it } from "vitest";

import { nextRecord, readBoardRecord, type BoardContent, type BoardItem } from "./boardRecord";
import { arrangeCards, boardProblems, boardToTree, problemText, treeToBoard, viewOf, type LinkedView } from "./bridge";
import { asNodeId } from "./ids";
import { addNextStep, deleteBranch } from "./tree";
import { buildTree } from "./testMaps";
import type { LinkMap, NodeId } from "./types";

const id = asNodeId;

const view: LinkedView = {
  page: { width: 800, height: 600 },
  direction: "TB",
  arrowLength: 47,
  hideCut: false,
  collapsed: [],
  places: {},
  colors: {},
  labels: {},
};

const item = (key: string, extra: Record<string, unknown> = {}): BoardItem => ({ id: key, title: key.toUpperCase(), ...extra });

/** "Move?" board: lists rent, buy; rent has a, a divider, b; buy has c and
    a note. Card `a` has pregame text, list `buy` a colour. */
function board(): BoardContent {
  return {
    lists: { rent: item("rent"), buy: item("buy", { color: "teal", status: "maybe" }) },
    cards: {
      a: item("a", { description: "pregame" }),
      div: item("div", { kind: "divider" }),
      b: item("b", { status: "cut" }),
      c: item("c"),
      note: item("note", { kind: "note" }),
    },
    listOrder: ["rent", "buy"],
    cardOrder: { rent: ["a", "div", "b"], buy: ["c", "note"] },
    trash: [],
    trashedLists: [],
    background: { kind: "color", color: "slate" },
  };
}

const tree = (b = board()) => boardToTree("move", "Move?", b, view).map;

/** Applies `edit` to the board's tree and writes it back. */
function write(edit: (map: LinkMap) => LinkMap, b = board()) {
  const result = treeToBoard(b, edit(tree(b)), 1000);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result;
}

/** Moves `child` to be `parent`'s next step at `index`. */
function moveTo(map: LinkMap, child: string, parent: string, index: number): LinkMap {
  const linkId = Object.values(map.links).find((l) => l.to === child)!.id;
  const order = { ...map.order };
  for (const key of Object.keys(order) as NodeId[]) order[key] = order[key].filter((c) => c !== child);
  const list = [...(order[id(parent)] ?? [])];
  list.splice(index, 0, id(child));
  order[id(parent)] = list;
  return { ...map, links: { ...map.links, [linkId]: { ...map.links[linkId], from: id(parent) } }, order };
}

describe("readBoardRecord", () => {
  const stored = () => ({ version: 2, rev: 7, board: board() });

  it("reads a whole board, keeping fields Linkkit doesn't use", () => {
    const read = readBoardRecord(stored());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.record.rev).toBe(7);
    expect(read.record.board.background).toEqual({ kind: "color", color: "slate" });
    expect(read.record.board.cards.a.description).toBe("pregame");
  });

  it("reads version 1 as rev 0, with the trash missing as empty", () => {
    const { trash: _t, trashedLists: _l, ...old } = board();
    const read = readBoardRecord({ version: 1, board: old });
    expect(read.status === "ok" && read.record.rev).toBe(0);
    expect(read.status === "ok" && read.record.board.trash).toEqual([]);
  });

  it("calls a newer version newer, and anything not clean damaged", () => {
    expect(readBoardRecord({ version: 3, rev: 1, board: {} }).status).toBe("newer");
    expect(readBoardRecord(null).status).toBe("damaged");
    expect(readBoardRecord({ version: 2, board: { ...board(), listOrder: ["rent", "ghost"] } }).status).toBe("damaged");
    expect(readBoardRecord({ version: 2, board: { ...board(), cardOrder: { rent: ["ghost"] } } }).status).toBe("damaged");
    const untitled = { ...board(), cards: { ...board().cards, a: { id: "a" } } };
    expect(readBoardRecord({ version: 2, board: untitled }).status).toBe("damaged");
  });

  it("next record is version 2 with rev one up", () => {
    const read = readBoardRecord({ version: 1, rev: 4, board: board() });
    if (read.status !== "ok") throw new Error();
    expect(nextRecord(read.record, read.record.board)).toMatchObject({ version: 2, rev: 5 });
  });
});

describe("boardToTree", () => {
  it("makes the board the start, lists its next steps, cards theirs", () => {
    const map = tree();
    expect(map.kind).toBe("tree");
    expect(map.nodes[id("move")].name).toBe("Move?");
    expect(map.order[id("move")]).toEqual(ids("rent", "buy"));
    expect(map.order[id("rent")]).toEqual(ids("a", "b"));
    expect(map.order[id("buy")]).toEqual(ids("c"));
    expect(map.nodes[id("buy")].status).toBe("maybe");
    expect(map.nodes[id("b")].status).toBe("cut");
  });

  it("leaves out dividers, notes, trashed cards and trashed lists", () => {
    const b = { ...board(), listOrder: ["rent"], cardOrder: { rent: ["div", "b"], buy: ["c"] } };
    const map = tree(b);
    expect(Object.keys(map.nodes).sort()).toEqual(["b", "move", "rent"]);
  });

  it("gives each arrow its box's id, and lays the view over it", () => {
    const placed: LinkedView = {
      ...view,
      places: { [id("move")]: { x: 5, y: 6 } },
      colors: { [id("a")]: "red" },
      labels: { [id("a")]: "if cheap" },
      collapsed: ids("buy", "gone"),
    };
    const { map, unplaced } = boardToTree("move", "Move?", board(), placed);
    expect(map.links["a" as never]).toMatchObject({ from: "rent", to: "a", label: "if cheap" });
    expect(map.nodes[id("move")]).toMatchObject({ x: 5, y: 6 });
    expect(map.nodes[id("a")].color).toBe("red");
    expect(map.collapsed).toEqual(ids("buy"));
    expect(unplaced).not.toContain("move");
    expect(unplaced).toContain("a");
  });

  it("round-trips through viewOf", () => {
    const map = tree();
    expect(boardToTree("move", "Move?", board(), viewOf(map)).map).toEqual(map);
  });
});

describe("treeToBoard", () => {
  it("changes nothing for an unchanged tree", () => {
    const result = write((m) => m);
    expect(result.changed).toBe(false);
    expect(result.name).toBe("Move?");
  });

  it("renames and sets status, keeping everything else on the item", () => {
    const result = write((m) => ({
      ...m,
      nodes: {
        ...m.nodes,
        [id("a")]: { ...m.nodes[id("a")], name: "Flat", status: "keep" },
        [id("buy")]: { ...m.nodes[id("buy")], status: null },
      },
    }));
    expect(result.board.cards.a).toEqual({ id: "a", title: "Flat", description: "pregame", status: "keep" });
    expect(result.board.lists.buy).toEqual({ id: "buy", title: "BUY", color: "teal" });
    expect(result.board.background).toEqual({ kind: "color", color: "slate" });
    expect(result.changed).toBe(true);
  });

  it("adds new lists and cards", () => {
    const result = write((m) => {
      const list = addNextStep(m, id("move"), { x: 0, y: 0 }, "Stay", id("stay"))!;
      return addNextStep(list.map, id("stay"), { x: 0, y: 0 }, "Paint", id("paint"))!.map;
    });
    expect(result.board.listOrder).toEqual(["rent", "buy", "stay"]);
    expect(result.board.lists.stay).toEqual({ id: "stay", title: "Stay" });
    expect(result.board.cardOrder.stay).toEqual(["paint"]);
    expect(result.board.cards.paint).toEqual({ id: "paint", title: "Paint" });
  });

  it("reorders lists", () => {
    expect(write((m) => moveTo(m, "buy", "move", 0)).board.listOrder).toEqual(["buy", "rent"]);
  });

  it("moves a card to another list, after the card above it there", () => {
    const result = write((m) => moveTo(m, "b", "buy", 1));
    expect(result.board.cardOrder).toEqual({ rent: ["a", "div"], buy: ["c", "b", "note"] });
  });

  it("trashes a deleted card, and a deleted list with its cards kept in it", () => {
    const card = write((m) => deleteBranch(m, id("a")));
    expect(card.board.cardOrder.rent).toEqual(["div", "b"]);
    expect(card.board.trash).toEqual([{ cardId: "a", listId: "rent", deletedAt: 1000 }]);
    expect(card.board.cards.a).toBeDefined();

    const list = write((m) => deleteBranch(m, id("rent")));
    expect(list.board.listOrder).toEqual(["buy"]);
    expect(list.board.trashedLists).toEqual([{ listId: "rent", deletedAt: 1000 }]);
    expect(list.board.cardOrder.rent).toEqual(["a", "div", "b"]);
    expect(list.board.trash).toEqual([]);
  });

  it("takes a box back out of the trash when it is in the tree again", () => {
    const trashed = write((m) => deleteBranch(m, id("rent"))).board;
    const back = write((m) => {
      const list = addNextStep(m, id("move"), { x: 0, y: 0 }, "RENT", id("rent"))!;
      return list.map;
    }, trashed);
    expect(back.board.trashedLists).toEqual([]);
    expect(back.board.listOrder).toEqual(["buy", "rent"]);
    // The tree had no cards under it, so they went to the trash this time.
    expect(back.board.trash.map((e) => e.cardId)).toEqual(["a", "b"]);
  });

  it("refuses a tree that doesn't fit, a level change and a full list", () => {
    const deep = addNextStep(tree(), id("a"), { x: 0, y: 0 }, "Too deep", id("deep"))!.map;
    expect(treeToBoard(board(), deep, 0)).toEqual({ ok: false, problems: [{ kind: "too-deep", box: "deep", level: 4 }] });

    const promoted = moveTo(tree(), "c", "move", 2);
    expect(treeToBoard(board(), promoted, 0)).toEqual({ ok: false, problems: [{ kind: "changes-level", box: "c" }] });

    let crowded = tree();
    for (let i = 0; i < 49; i++) crowded = addNextStep(crowded, id("rent"), { x: 0, y: 0 }, `n${i}`, id(`n${i}`))!.map;
    expect(treeToBoard(board(), crowded, 0)).toEqual({ ok: false, problems: [{ kind: "list-full", box: "rent" }] });
  });
});

describe("arrangeCards", () => {
  const shownIds = new Set(["a", "b", "c", "x"]);
  const shown = (key: string) => shownIds.has(key);

  it("keeps dividers in place when cards are reordered", () => {
    // Moving c up between a and b goes right after a, past the divider.
    expect(arrangeCards(["a", "div", "b", "c"], ["a", "c", "b"], shown)).toEqual(["a", "c", "div", "b"]);
  });

  it("puts a card dropped at the top right before the first shown card", () => {
    expect(arrangeCards(["div", "a", "b"], ["b", "a"], shown)).toEqual(["div", "b", "a"]);
  });

  it("puts a card arriving in a list with only hidden cards at the end", () => {
    expect(arrangeCards(["div"], ["x"], shown)).toEqual(["div", "x"]);
  });

  it("never moves a divider when a card leaves", () => {
    expect(arrangeCards(["a", "div", "b"], ["b"], shown)).toEqual(["div", "b"]);
  });
});

describe("boardProblems", () => {
  // q -> l1 -> c1 -> deep -> deeper; q -> l2 -> c1 (two ways in)
  const bad = () =>
    buildTree("q", ["l1", "l2", "c1", "deep", "deeper"], [
      ["q", "l1"],
      ["q", "l2"],
      ["l1", "c1"],
      ["l2", "c1"],
      ["c1", "deep"],
      ["deep", "deeper"],
    ]);

  it("names each box with two ways in, and the top box of a too-deep branch", () => {
    expect(boardProblems(bad())).toEqual([
      { kind: "two-ways-in", box: "c1" },
      { kind: "too-deep", box: "deep", level: 4 },
    ]);
  });

  it("says each in words", () => {
    const map = bad();
    expect(boardProblems(map).map((p) => problemText(map, p))).toEqual([
      '"c1" has two ways in.',
      '"deep" is 4 levels deep.',
    ]);
  });

  it("finds nothing wrong with a board's own tree, and refuses a connections map", () => {
    expect(boardProblems(tree())).toEqual([]);
    expect(boardProblems({ ...tree(), kind: "connections" })).toEqual([{ kind: "not-a-tree" }]);
  });
});

function ids(...names: string[]): NodeId[] {
  return names.map(asNodeId);
}
