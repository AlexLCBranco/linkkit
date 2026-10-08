import { describe, expect, it } from "vitest";

import type { BoardContent } from "./boardRecord";
import { boardToTree, linkedTree, noteHome, treeToBoard, unlinked, viewOf, withHeldNotes, EMPTY_BOARD } from "./bridge";
import { asNodeId } from "./ids";
import { deleteNodes, resolveNoteClash, setNodeNotes } from "./map";
import { readMap, serializeMap, serializeStored } from "./persistence";
import { buildTree } from "./testMaps";
import type { LinkMap } from "./types";

const id = asNodeId;
const PAGE = { width: 800, height: 600 };

/** start s -> lists l, m -> cards c (in l), d (in m). Linked to board "s". */
function linked(): LinkMap {
  const tree = buildTree("s", ["l", "m", "c", "d"], [["s", "l"], ["s", "m"], ["l", "c"], ["m", "d"]]);
  return { ...tree, linkedBoard: "s" };
}

function boardOf(map: LinkMap, board: BoardContent = EMPTY_BOARD): BoardContent {
  const written = treeToBoard(board, map, 7);
  if (!written.ok) throw new Error("refused");
  return written.board;
}

const withPregame = (board: BoardContent, card: string, text: string | undefined): BoardContent => {
  const { description: _, ...rest } = board.cards[card];
  return { ...board, cards: { ...board.cards, [card]: text === undefined ? rest : { ...rest, description: text } } };
};

/** The map a stored copy and the board make (what Linkkit opens). */
const opened = (copy: LinkMap, board: BoardContent) => linkedTree(copy, "S", board).map;

describe("notes in a map linked to Boardkit (plan B)", () => {
  it("know where they live: a card's in Boardkit, the start's and lists' in Linkkit", () => {
    const map = linked();
    expect([noteHome(map, id("s")), noteHome(map, id("l")), noteHome(map, id("c"))]).toEqual(["linkkit", "linkkit", "card"]);
    expect(noteHome(unlinked(map), id("c"))).toBe("map");
  });

  it("sync a card's note with its pregame thots both ways, clearing included", () => {
    const map = opened(linked(), boardOf(linked()));
    expect(map.cardNotesShared).toBe(true);
    // Typed in Linkkit: written to the card.
    const typed = setNodeNotes(map, id("c"), "from Linkkit");
    const board = boardOf(typed);
    expect(board.cards.c.description).toBe("from Linkkit");
    // Changed in Boardkit: the box follows, and that is no clash.
    const edited = opened(typed, withPregame(board, "c", "from Boardkit"));
    expect(edited.nodes[id("c")].notes).toBe("from Boardkit");
    expect(edited.noteClashes).toBeUndefined();
    // Emptied in Linkkit: the pregame thots go.
    expect(boardOf(setNodeNotes(edited, id("c"), ""), board).cards.c).not.toHaveProperty("description");
  });

  it("from a map saved before notes were shared: one side empty takes the other, nothing overwritten", () => {
    const board = boardOf(linked());
    const old = setNodeNotes(linked(), id("c"), "Linkkit text"); // no cardNotesShared: Linkkit's own
    const map = opened(old, board);
    expect(map.nodes[id("c")].notes).toBe("Linkkit text");
    expect(boardOf(map, board).cards.c.description).toBe("Linkkit text");
    expect(map.noteClashes).toBeUndefined();
    // Boardkit has text, Linkkit none: Boardkit's.
    expect(opened(linked(), withPregame(board, "c", "Boardkit text")).nodes[id("c")].notes).toBe("Boardkit text");
  });

  it("from a map saved before: two different texts are a clash, both kept until picked", () => {
    const board = withPregame(boardOf(linked()), "c", "Boardkit text");
    const map = opened(setNodeNotes(linked(), id("c"), "Linkkit text"), board);
    expect(map.nodes[id("c")].notes).toBe("Boardkit text");
    expect(map.noteClashes).toEqual({ c: "Linkkit text" });
    // Saving writes nothing over Boardkit's text, and keeps the clash.
    expect(boardOf(map, board).cards.c.description).toBe("Boardkit text");
    const again = opened(map, boardOf(map, board));
    expect(again.noteClashes).toEqual({ c: "Linkkit text" });
    // And through the stored record.
    const read = readMap(JSON.parse(JSON.stringify(serializeStored(again, 2))), PAGE);
    expect(read.status === "ok" && read.map.noteClashes).toEqual({ c: "Linkkit text" });
    expect(read.status === "ok" && read.map.cardNotesShared).toBe(true);
  });

  it("settle a clash by the user's pick: Boardkit's, Linkkit's or both", () => {
    const board = withPregame(boardOf(linked()), "c", "Boardkit text");
    const map = opened(setNodeNotes(linked(), id("c"), "Linkkit text"), board);
    const pick = (p: "note" | "aside" | "both") => resolveNoteClash(map, id("c"), p);
    expect(pick("note").nodes[id("c")].notes).toBe("Boardkit text");
    expect(pick("aside").nodes[id("c")].notes).toBe("Linkkit text");
    expect(pick("both").nodes[id("c")].notes).toBe("Boardkit text\n\nLinkkit text");
    for (const p of ["note", "aside", "both"] as const) expect(pick(p).noteClashes).toBeUndefined();
    expect(boardOf(pick("aside"), board).cards.c.description).toBe("Linkkit text");
    const settled = pick("note");
    expect(resolveNoteClash(settled, id("c"), "aside")).toBe(settled);
  });

  it("keep a list's note while the list waits in Boardkit's trash, deleted in either app", () => {
    let map = opened(linked(), boardOf(linked()));
    map = setNodeNotes(map, id("m"), "list note");
    const board = boardOf(map);
    // Deleted in Linkkit: the list (and its card) go to Boardkit's trash.
    const gone = withHeldNotes(map, deleteNodes(map, [id("m"), id("d")]));
    expect(gone.heldNotes).toEqual({ m: "list note" });
    const trashed = boardOf(gone, board);
    const away = opened(gone, trashed);
    expect(away.heldNotes).toEqual({ m: "list note" });
    // Restored in Boardkit: the note comes back with it.
    const restored: BoardContent = { ...trashed, listOrder: [...trashed.listOrder, "m"], trashedLists: [] };
    const back = opened(away, restored);
    expect(back.nodes[id("m")].notes).toBe("list note");
    expect(back.heldNotes).toBeUndefined();
    // Deleted in Boardkit instead: held from the copy Linkkit had.
    const inBoardkit: BoardContent = { ...board, listOrder: ["l"], trashedLists: [{ listId: "m", deletedAt: 1 }] };
    expect(opened(map, inBoardkit).heldNotes).toEqual({ m: "list note" });
    // Erased for good from Boardkit's trash: nothing left to hold it for.
    const erased: BoardContent = { ...inBoardkit, trashedLists: [] };
    expect(opened(opened(map, inBoardkit), erased).heldNotes).toBeUndefined();
  });

  it("leave linked-only fields behind when unlinked, and out of exported files", () => {
    const map = { ...opened(linked(), boardOf(linked())), heldNotes: { m: "x" } } as LinkMap;
    expect(unlinked(map)).not.toHaveProperty("heldNotes");
    expect(unlinked(map)).not.toHaveProperty("cardNotesShared");
    const exported = serializeMap(map).map as unknown as Record<string, unknown>;
    expect(exported.heldNotes).toBeUndefined();
    expect(exported.cardNotesShared).toBeUndefined();
  });

  it("of an unlinked tree's lists come along when it is linked, in Linkkit only", () => {
    const tree = setNodeNotes(buildTree("s", ["l"], [["s", "l"]]), id("l"), "mine");
    const { map } = boardToTree("s", "S", boardOf({ ...tree, linkedBoard: "s" }), viewOf(tree));
    expect(map.nodes[id("l")].notes).toBe("mine");
  });
});
