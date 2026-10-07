import { beforeEach, describe, expect, it, vi } from "vitest";

import { boardToTree, linkTree, unlinked, type LinkedView } from "../domain/bridge";
import { asMapId, asNodeId } from "../domain/ids";
import { moveNode, renameMap, renameNode } from "../domain/map";
import { serializeStored } from "../domain/persistence";
import { moveToParent } from "../domain/tree";
import type { LinkMap } from "../domain/types";
import { useLinkHold } from "./linkHold";
import { memoryStorage } from "./memoryStorage";
import { catchUpMap, linkStoredMap, loadMap, onMapMerged, saveMap, takeUnplaced } from "./persistMap";
import { useSaveHealth } from "./saveHealth";
import { useSyncNotice } from "./syncNotice";

const PAGE = { width: 900, height: 560 };
const MAP_ID = asMapId("m1");
const MAP_KEY = "linkkit:map:m1";
const BOARD_KEY = "boardkit:board:move";
const LIST_KEY = "boardkit:registry";
const id = asNodeId;

const view: LinkedView = {
  page: PAGE,
  direction: "TB",
  arrowLength: 47,
  hideCut: false,
  collapsed: [],
  places: {},
  colors: {},
  labels: {},
};

/** Boardkit's "Move?" board: lists rent (a, b) and buy (c). */
const boardData = () => ({
  lists: { rent: { id: "rent", title: "Rent" }, buy: { id: "buy", title: "Buy", color: "teal" } },
  cards: {
    a: { id: "a", title: "A", description: "pregame" },
    b: { id: "b", title: "B" },
    c: { id: "c", title: "C" },
  },
  listOrder: ["rent", "buy"],
  cardOrder: { rent: ["a", "b"], buy: ["c"] },
  trash: [],
  trashedLists: [],
  background: { kind: "color", color: "slate" },
});

type Board = ReturnType<typeof boardData>;

const storeBoard = (board: Board, rev: number) =>
  localStorage.setItem(BOARD_KEY, JSON.stringify({ version: 2, rev, board }));
const storedBoard = () => JSON.parse(localStorage.getItem(BOARD_KEY)!) as { rev: number; board: Board };
const storedCopy = () => JSON.parse(localStorage.getItem(MAP_KEY)!) as { version: number; rev: number; map: LinkMap };

/** Linkkit's copy of the board's tree: every box placed, linked. */
function copy(board = boardData()): LinkMap {
  const tree = boardToTree("move", "Move?", board, view).map;
  const nodes = Object.fromEntries(Object.values(tree.nodes).map((n, i) => [n.id, { ...n, x: 100 + 10 * i, y: 50 }]));
  return { ...tree, id: MAP_ID, nodes, linkedBoard: "move" };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  useSaveHealth.setState({ failing: [] });
  useLinkHold.setState({ held: {} });
  useSyncNotice.setState({ message: null });
  storeBoard(boardData(), 1);
  localStorage.setItem(LIST_KEY, JSON.stringify({ version: 1, boards: [{ id: "move", name: "Move?" }], activeBoardId: "move" }));
  localStorage.setItem(MAP_KEY, JSON.stringify(serializeStored(copy(), 1)));
});

describe("opening a linked tree", () => {
  it("builds it from the board, with Linkkit's places, and refreshes the copy", () => {
    const changed = boardData();
    changed.cards.a = { ...changed.cards.a, title: "A2" };
    storeBoard(changed, 2);
    const map = loadMap(MAP_ID, PAGE)!;
    expect(map.nodes[id("a")]).toMatchObject({ name: "A2", x: copy().nodes[id("a")].x });
    expect(map.linkedBoard).toBe("move");
    expect(takeUnplaced(MAP_ID)).toBe(false);
    expect(storedCopy()).toMatchObject({ version: 2, rev: 2 });
    expect(storedCopy().map.nodes[id("a")].name).toBe("A2");
    // Opening writes nothing to Boardkit.
    expect(storedBoard().rev).toBe(2);
  });

  it("asks for boxes made in Boardkit to be tidied in, leaving the copy for then", () => {
    const more = boardData();
    more.cards = { ...more.cards, d: { id: "d", title: "D" } } as Board["cards"];
    more.cardOrder = { ...more.cardOrder, buy: ["c", "d"] };
    storeBoard(more, 2);
    expect(loadMap(MAP_ID, PAGE)!.nodes[id("d")]).toBeDefined();
    expect(takeUnplaced(MAP_ID)).toBe(true);
    expect(takeUnplaced(MAP_ID)).toBe(false);
    expect(storedCopy().rev).toBe(1);
  });

  it("keeps the copy as an ordinary tree when the board was deleted in Boardkit", () => {
    localStorage.removeItem(BOARD_KEY);
    const map = loadMap(MAP_ID, PAGE)!;
    expect(map.linkedBoard).toBeUndefined();
    expect(map.nodes[id("a")].name).toBe("A");
    expect(storedCopy().version).toBe(1);
    expect(useSyncNotice.getState().message?.text).toMatch(/deleted in Boardkit/);
  });

  it("opens the copy read-only when the board is from a newer Boardkit, and saves nothing", () => {
    localStorage.setItem(BOARD_KEY, JSON.stringify({ version: 3, rev: 5, board: {} }));
    const map = loadMap(MAP_ID, PAGE)!;
    expect(useLinkHold.getState().held[MAP_ID]).toBe("newer");
    const before = localStorage.getItem(BOARD_KEY);
    saveMap(renameNode(map, id("a"), "Changed"));
    expect(localStorage.getItem(BOARD_KEY)).toBe(before);
    expect(storedCopy().rev).toBe(1);
  });
});

describe("saving a linked tree", () => {
  it("writes the board first (rev up, Boardkit's own fields kept), then Linkkit's copy", () => {
    const map = loadMap(MAP_ID, PAGE)!;
    saveMap(renameNode(map, id("a"), "Flat"));
    const { rev, board } = storedBoard();
    expect(rev).toBe(2);
    expect(board.cards.a).toEqual({ id: "a", title: "Flat", description: "pregame" });
    expect(board.lists.buy.color).toBe("teal");
    expect(board.background).toEqual(boardData().background);
    expect(storedCopy()).toMatchObject({ version: 2, rev: 2 });
  });

  it("writes only Linkkit's copy for a change of its own (a move)", () => {
    const map = loadMap(MAP_ID, PAGE)!;
    saveMap(moveNode(map, id("a"), { x: 7, y: 8 }));
    expect(storedBoard().rev).toBe(1);
    expect(storedCopy().map.nodes[id("a")]).toMatchObject({ x: 7, y: 8 });
  });

  it("moves a card to another list (step 21's drag), keeping what Boardkit has on it", () => {
    const map = loadMap(MAP_ID, PAGE)!;
    saveMap(moveToParent(map, id("a"), id("buy"), id("c")));
    const { rev, board } = storedBoard();
    expect(rev).toBe(2);
    expect(board.cardOrder).toEqual({ rent: ["b"], buy: ["a", "c"] });
    expect(board.cards.a).toEqual({ id: "a", title: "A", description: "pregame" });
    expect(board.trash).toEqual([]);
  });

  it("renames the board in Boardkit's list when the start box is renamed", () => {
    const map = loadMap(MAP_ID, PAGE)!;
    saveMap(renameNode(map, id("move"), "Stay?"));
    const list = JSON.parse(localStorage.getItem(LIST_KEY)!);
    expect(list).toEqual({ version: 1, boards: [{ id: "move", name: "Stay?" }], activeBoardId: "move" });
  });

  it("merges a Boardkit change made since, keeping both", () => {
    const merged = vi.fn();
    onMapMerged(merged);
    const map = loadMap(MAP_ID, PAGE)!;
    const theirs = boardData();
    theirs.cards.a = { ...theirs.cards.a, title: "A from Boardkit" };
    storeBoard(theirs, 2);
    saveMap(renameNode(map, id("b"), "B from Linkkit"));
    const { rev, board } = storedBoard();
    expect(rev).toBe(3);
    expect(board.cards.a.title).toBe("A from Boardkit");
    expect(board.cards.b.title).toBe("B from Linkkit");
    expect(merged).toHaveBeenCalled();
  });

  it("writes nothing of Linkkit's when the board's write fails, and retries through the rev check", () => {
    const map = loadMap(MAP_ID, PAGE)!;
    const storage = localStorage;
    const setItem = storage.setItem.bind(storage);
    let full = true;
    storage.setItem = (k, v) => {
      if (full && k === BOARD_KEY) throw new Error("quota");
      setItem(k, v);
    };
    saveMap(renameNode(map, id("a"), "Flat"));
    expect(useSaveHealth.getState().failing).toEqual([BOARD_KEY]);
    expect(storedCopy().rev).toBe(1);

    // Meanwhile Boardkit changed another card.
    const theirs = boardData();
    theirs.cards.c = { ...theirs.cards.c, title: "C from Boardkit" };
    setItem(BOARD_KEY, JSON.stringify({ version: 2, rev: 2, board: theirs }));
    full = false;
    useSaveHealth.getState().retryAll();
    expect(useSaveHealth.getState().failing).toEqual([]);
    expect(storedBoard().board.cards.a.title).toBe("Flat");
    expect(storedBoard().board.cards.c.title).toBe("C from Boardkit");
    expect(storedCopy().map.nodes[id("a")].name).toBe("Flat");
  });

  it("keeps the change as an ordinary tree when the board was deleted in Boardkit before the save", () => {
    const map = loadMap(MAP_ID, PAGE)!;
    localStorage.removeItem(BOARD_KEY);
    saveMap(renameNode(map, id("a"), "Flat"));
    expect(storedCopy().version).toBe(1);
    expect(storedCopy().map.nodes[id("a")].name).toBe("Flat");
  });
});

describe("another app's save", () => {
  it("brings Boardkit's change in, with this tab's unsaved change on top", () => {
    const map = loadMap(MAP_ID, PAGE)!;
    const theirs = boardData();
    theirs.cards.a = { ...theirs.cards.a, title: "A from Boardkit" };
    storeBoard(theirs, 2);
    const result = catchUpMap(MAP_ID, moveNode(map, id("b"), { x: 1, y: 2 }));
    expect(result.kind).toBe("merged");
    if (result.kind !== "merged") return;
    expect(result.map.nodes[id("a")].name).toBe("A from Boardkit");
    expect(result.map.nodes[id("b")]).toMatchObject({ x: 1, y: 2 });
  });

  it("takes a rename in Boardkit's list in", () => {
    const map = loadMap(MAP_ID, PAGE)!;
    localStorage.setItem(LIST_KEY, JSON.stringify({ version: 1, boards: [{ id: "move", name: "Go?" }], activeBoardId: "move" }));
    const result = catchUpMap(MAP_ID, map);
    expect(result.kind === "merged" && result.map.name).toBe("Go?");
  });

  it("is nothing new when only Boardkit's open board changed", () => {
    const map = loadMap(MAP_ID, PAGE)!;
    localStorage.setItem(LIST_KEY, JSON.stringify({ version: 1, boards: [{ id: "move", name: "Move?" }], activeBoardId: "x" }));
    expect(catchUpMap(MAP_ID, map).kind).toBe("current");
  });
});

describe("linking a tree (Link to Boardkit)", () => {
  const PLAIN_ID = asMapId("p1");
  const PLAIN_KEY = "linkkit:map:p1";
  /** An ordinary tree "Plan": lists l1 (card c1) and l2, stored, with
      something in its own trash. */
  function plain(): LinkMap {
    const tree = { ...unlinked(copy()), id: PLAIN_ID };
    const renamed = renameNode(renameMap(tree, "Plan map"), id("move"), "Plan");
    const trashed = { deletedAt: 1, nodes: [{ ...renamed.nodes[id("b")], id: id("old") }], links: [], places: [] };
    return { ...renamed, trash: [trashed] };
  }
  const linking = (map: LinkMap, taken = (boardId: string) => boardId === "move") => {
    const result = linkTree(map, taken, () => id("fresh"));
    if (!result.ok || !result.map.linkedBoard) throw new Error("refused");
    return result as typeof result & { map: LinkMap & { linkedBoard: string } };
  };
  const list = () => JSON.parse(localStorage.getItem(LIST_KEY)!) as { boards: { id: string; name: string }[]; activeBoardId: string };

  beforeEach(() => {
    saveMap(plain());
  });

  it("stores the new board, adds it to Boardkit's list, and stores the map linked", () => {
    const result = linking(plain());
    expect(result.boardId).toBe("fresh");
    expect(linkStoredMap(result.map, result.name, result.board)).toBe(true);
    const board = JSON.parse(localStorage.getItem("boardkit:board:fresh")!);
    expect(board).toMatchObject({ version: 2, rev: 1 });
    expect(board.board.listOrder).toEqual(["rent", "buy"]);
    expect(list().boards).toEqual([
      { id: "move", name: "Move?" },
      { id: "fresh", name: "Plan" },
    ]);
    // Which board Boardkit opens is Boardkit's.
    expect(list().activeBoardId).toBe("move");
    const stored = JSON.parse(localStorage.getItem(PLAIN_KEY)!);
    expect(stored.version).toBe(2);
    expect(stored.map.linkedBoard).toBe("fresh");
    expect(stored.map.trash).toEqual([]);
    // It opens as a linked tree, built from its board.
    const opened = loadMap(PLAIN_ID, PAGE)!;
    expect(opened.linkedBoard).toBe("fresh");
    expect(opened.name).toBe("Plan");
  });

  it("takes the board back and leaves the map as it was when the map's write fails", () => {
    const before = localStorage.getItem(PLAIN_KEY);
    const storage = localStorage;
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (k, v) => {
      if (k === PLAIN_KEY) throw new Error("quota");
      setItem(k, v);
    };
    const result = linking(plain());
    expect(linkStoredMap(result.map, result.name, result.board)).toBe(false);
    expect(localStorage.getItem("boardkit:board:fresh")).toBeNull();
    expect(list().boards.map((b) => b.id)).toEqual(["move"]);
    expect(localStorage.getItem(PLAIN_KEY)).toBe(before);
  });

  it("writes nothing when Boardkit's list can't take the board", () => {
    const storage = localStorage;
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (k, v) => {
      if (k === LIST_KEY) throw new Error("quota");
      setItem(k, v);
    };
    const before = localStorage.getItem(PLAIN_KEY);
    const result = linking(plain());
    expect(linkStoredMap(result.map, result.name, result.board)).toBe(false);
    expect(localStorage.getItem("boardkit:board:fresh")).toBeNull();
    expect(localStorage.getItem(PLAIN_KEY)).toBe(before);
  });

  it("an unlink stored by another tab turns this tab's linked map ordinary, not linked again", () => {
    const result = linking(plain());
    linkStoredMap(result.map, result.name, result.board);
    const mine = loadMap(PLAIN_ID, PAGE)!;
    // The other tab unlinks and stores it as an ordinary tree.
    const theirs = unlinked(mine);
    localStorage.setItem(PLAIN_KEY, JSON.stringify(serializeStored(theirs, 3)));
    const caught = catchUpMap(PLAIN_ID, mine);
    expect(caught.kind).toBe("merged");
    expect(caught.kind === "merged" && caught.map.linkedBoard).toBeUndefined();
    // A save from this tab now keeps it ordinary.
    saveMap(caught.kind === "merged" ? moveNode(caught.map, id("a"), { x: 1, y: 2 }) : mine);
    expect(JSON.parse(localStorage.getItem(PLAIN_KEY)!).version).toBe(1);
  });
});
