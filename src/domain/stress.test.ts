import { describe, expect, it } from "vitest";

import { readBoardRecord, type BoardContent } from "./boardRecord";
import { boardRefusal, linkedProblem, linkedTree, linkTree, problemText, treeToBoard, withStartName } from "./bridge";
import { EMPTY_HISTORY, record, redo, undo, type History, type Step } from "./history";
import { asLinkId, asNodeId } from "./ids";
import {
  addLink,
  addNode,
  deleteLink,
  moveNode,
  renameNode,
  setDirection,
  setHideCut,
  setCollapsed,
  setLinkLabel,
  setNodeColor,
  setNodesStatus,
} from "./map";
import { mergeMaps, sameMap } from "./merge";
import { nextSteps } from "./order";
import { readMap, serializeStored } from "./persistence";
import { canAddNextStep, canCollapse, canDeleteLink, canMove, canSetStatus } from "./rules";
import { build, buildTree } from "./testMaps";
import { restoreFromTrash, trashBoxes, trashEntryId } from "./trash";
import { addNextStep, branchesOf, deleteBranches, moveToParent } from "./tree";
import { NODE_STATUSES, PALETTE_COLORS, type LinkMap, type NodeId } from "./types";

/**
 * Seeded random edits, two-tab merges (and, for a linked tree, Boardkit's
 * edits arriving), undo and redo: every map must still load without
 * needing repair. Boardkit's `stress.test.ts`, for maps. Seeded, so a
 * failure replays exactly. Kept small enough for the everyday run.
 */
function random(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T,>(items: readonly T[]): T | undefined => (items.length ? items[int(items.length)] : undefined);
  return { int, pick };
}
type Rnd = ReturnType<typeof random>;

const PAGE = { width: 800, height: 600 };

/** What a reload would make of `map`: "ok" unless it needed repair. */
const healthy = (map: LinkMap) => readMap(JSON.parse(JSON.stringify(serializeStored(map, 1))), PAGE).status;

/** The board once this tab has saved `map` onto it (`null` for an unlinked
    map). It must take the map, and read cleanly in Boardkit. */
function saved(board: BoardContent | null, map: LinkMap): BoardContent | null {
  if (!board) return null;
  const written = treeToBoard(board, map, 0);
  if (!written.ok) throw new Error(problemText(map, written.problems[0]));
  const record = JSON.parse(JSON.stringify({ version: 2, rev: 1, board: written.board }));
  expect(readBoardRecord(record).status).toBe("ok");
  return written.board;
}

const KINDS = ["connections", "tree", "linked"] as const;
type Kind = (typeof KINDS)[number];

function start(kind: Kind): { map: LinkMap; board: BoardContent | null } {
  if (kind === "connections") {
    return { map: build(["a", "b", "c", "d", "e"], [["a", "b"], ["b", "c"], ["a", "d"], ["d", "e"]]), board: null };
  }
  const tree = buildTree("s", ["l1", "l2", "l3", "c1", "c2", "c3", "c4"], [
    ["s", "l1"],
    ["s", "l2"],
    ["s", "l3"],
    ["l1", "c1"],
    ["l1", "c2"],
    ["l2", "c3"],
    ["l3", "c4"],
  ]);
  if (kind === "tree") return { map: tree, board: null };
  const linked = linkTree(tree, () => false, () => asNodeId("fresh"));
  if (!linked.ok) throw new Error("example tree refused");
  return { map: linked.map, board: linked.board };
}

const boxes = (map: LinkMap) => Object.keys(map.nodes) as NodeId[];

/** One random edit, as the store would make it (rules asked first). */
function randomEdit(map: LinkMap, rnd: Rnd, tag: string, n: number): LinkMap {
  const tree = map.kind === "tree";
  const linked = map.linkedBoard !== undefined;
  const id = rnd.pick(boxes(map));
  const other = rnd.pick(boxes(map));
  const link = rnd.pick(Object.values(map.links));
  let next = map;
  switch (rnd.int(13)) {
    case 0:
      if (id) next = renameNode(map, id, `${tag}${n}`);
      break;
    case 1:
      if (id) next = moveNode(map, id, { x: rnd.int(700), y: rnd.int(500) });
      break;
    case 2:
      if (id) next = setNodeColor(map, id, rnd.pick([null, ...PALETTE_COLORS]) ?? null);
      break;
    case 3: {
      const newId = asNodeId(`${tag}n${n}`);
      if (!tree) next = addNode(map, { x: rnd.int(700), y: rnd.int(500) }, `${tag}${n}`, newId).map;
      else if (id && canAddNextStep(map, id)) {
        next = addNextStep(map, id, { x: 0, y: 0 }, `${tag}${n}`, newId, asLinkId(linked ? newId : `${tag}a${n}`))?.map ?? map;
      }
      break;
    }
    case 4:
      if (id && other) {
        const added = addLink(map, id, other, undefined, asLinkId(`${tag}l${n}`));
        next = added.map;
      }
      break;
    case 5:
      if (link && canDeleteLink(map, link.id)) next = deleteLink(map, link.id);
      break;
    case 6:
      if (link) next = setLinkLabel(map, link.id, rnd.int(3) ? `${tag}${n}` : "");
      break;
    case 7:
      if (id) {
        const gone = tree ? branchesOf(map, [id]) : new Set([id]);
        if (gone.size === 0) break;
        next = linked ? deleteBranches(map, gone) : trashBoxes(map, gone, n);
      }
      break;
    case 8: {
      const entry = rnd.pick(map.trash);
      if (entry) next = restoreFromTrash(map, trashEntryId(entry), () => asLinkId(`${tag}r${n}`));
      break;
    }
    case 9:
      if (tree && id && other && canMove(map, id, other).ok) {
        next = moveToParent(map, id, other, rnd.pick(nextSteps(map, other)) ?? null);
      }
      break;
    case 10:
      if (tree && id && canSetStatus(map, id)) next = setNodesStatus(map, [id], rnd.pick([null, ...NODE_STATUSES]) ?? null);
      break;
    case 11:
      if (tree && id && canCollapse(map, id)) next = setCollapsed(map, [id], !map.collapsed.includes(id));
      break;
    default:
      next = tree && rnd.int(2) ? setHideCut(map, !map.hideCut) : setDirection(map, map.direction === "TB" ? "LR" : "TB");
  }
  // The store's last guard for a linked tree (`refused`), and its name rule.
  if (linkedProblem(next)) return map;
  return withStartName(next);
}

/** `count` random edits, recorded the way the store's `commit` records them. */
function edits(map: LinkMap, history: History, rnd: Rnd, tag: string, count: number) {
  for (let n = 0; n < count; n++) {
    const next = randomEdit(map, rnd, tag, n);
    if (next === map) continue;
    history = record(history, map, next);
    map = next;
    expect(healthy(map), `${tag} edit ${n}`).toBe("ok");
  }
  return { map, history };
}

/** One random Boardkit edit to a board: a card renamed, moved, trashed,
    restored or added, a list renamed, trashed or moved. */
function boardEdit(board: BoardContent, rnd: Rnd, n: number): BoardContent {
  const listId = rnd.pick(board.listOrder);
  const cards = listId ? (board.cardOrder[listId] ?? []) : [];
  const cardId = rnd.pick(cards);
  const without = (ids: readonly string[], id: string) => ids.filter((x) => x !== id);
  switch (rnd.int(8)) {
    case 0:
      return cardId ? { ...board, cards: { ...board.cards, [cardId]: { ...board.cards[cardId], title: `b${n}` } } } : board;
    case 1: {
      const to = rnd.pick(board.listOrder);
      if (!listId || !cardId || !to) return board;
      const moved = { ...board.cardOrder, [listId]: without(cards, cardId) };
      const target = moved[to] ?? [];
      return { ...board, cardOrder: { ...moved, [to]: [...target.slice(0, rnd.int(target.length + 1)), cardId, ...target.slice(rnd.int(target.length + 1))].filter((x, i, a) => a.indexOf(x) === i) } };
    }
    case 2:
      if (!listId || !cardId) return board;
      return {
        ...board,
        cardOrder: { ...board.cardOrder, [listId]: without(cards, cardId) },
        trash: [...board.trash, { cardId, listId, deletedAt: n }],
      };
    case 3: {
      const entry = rnd.pick(board.trash);
      if (!entry || !board.listOrder.includes(entry.listId)) return board;
      return {
        ...board,
        cardOrder: { ...board.cardOrder, [entry.listId]: [...(board.cardOrder[entry.listId] ?? []), entry.cardId] },
        trash: board.trash.filter((e) => e !== entry),
      };
    }
    case 4: {
      if (!listId) return board;
      const id = `bc${n}`;
      return {
        ...board,
        cards: { ...board.cards, [id]: { id, title: id } },
        cardOrder: { ...board.cardOrder, [listId]: [...cards, id] },
      };
    }
    case 5:
      return listId ? { ...board, lists: { ...board.lists, [listId]: { ...board.lists[listId], title: `bl${n}` } } } : board;
    case 6:
      if (!listId || board.listOrder.length < 2) return board;
      return {
        ...board,
        listOrder: without(board.listOrder, listId),
        trashedLists: [...board.trashedLists, { listId, deletedAt: n }],
      };
    default: {
      if (!listId) return board;
      const rest = without(board.listOrder, listId);
      const at = rnd.int(rest.length + 1);
      return { ...board, listOrder: [...rest.slice(0, at), listId, ...rest.slice(at)] };
    }
  }
}

/**
 * What arrives from outside while this tab holds `map`: another tab's
 * edits, merged as the store merges a save; for a linked tree, sometimes
 * Boardkit's edits instead, taken in as the store takes in a board
 * (`linkedTree`, with this tab's copy). Also the board as stored after.
 */
function outside(map: LinkMap, board: BoardContent | null, rnd: Rnd, count: number) {
  board = saved(board, map);
  if (board && rnd.int(2)) {
    let theirs = board;
    for (let n = 0; n < count; n++) theirs = boardEdit(theirs, rnd, n);
    return { map: linkedTree(map, null, theirs).map, board: theirs };
  }
  const tab = edits(map, EMPTY_HISTORY, rnd, "t", count).map;
  // The other tab saved first; the merge is this tab's next save.
  const merged = mergeMaps(map, map, tab).map;
  return { map: merged, board: saved(saved(board, tab), merged) };
}

/** Takes an undo or redo as the store's `stepping` does: a conflict, or a
    step the linked tree's board can't take, is refused. */
function take(step: Step, map: LinkMap, board: BoardContent | null): { map: LinkMap; refused: boolean } {
  if (step.conflicts.length || boardRefusal(board, step.map)) return { map, refused: true };
  return { map: step.map, refused: false };
}

// 150 seeds per test for the everyday run; STRESS_SEEDS=5000 npm test for a long one.
const SEEDS = Array.from({ length: Number(import.meta.env.STRESS_SEEDS) || 150 }, (_, i) => i + 1);

describe.each(KINDS)("stress (%s)", (kind) => {
  it("random edits never leave a map that needs repair", () => {
    for (const seed of SEEDS) {
      const first = start(kind);
      saved(first.board, edits(first.map, EMPTY_HISTORY, random(seed), "m", 30).map);
    }
  });

  it("undo all the way back is the starting map, redo all the way is the end", () => {
    for (const seed of SEEDS) {
      const first = start(kind).map;
      const { map: end, history } = edits(first, EMPTY_HISTORY, random(seed), "m", 20);
      let map = end;
      let h = history;
      for (let step = undo(h, map); step; step = undo(h, map)) {
        expect(step.conflicts).toEqual([]);
        ({ map, history: h } = step);
      }
      expect(sameMap(map, first), `seed ${seed}`).toBe(true);
      for (let step = redo(h, map); step; step = redo(h, map)) ({ map, history: h } = step);
      expect(sameMap(map, end), `seed ${seed}`).toBe(true);
    }
  });

  it("merging two tabs never leaves a map that needs repair", () => {
    for (const seed of SEEDS) {
      const rnd = random(seed);
      const first = start(kind);
      const mine = edits(first.map, EMPTY_HISTORY, rnd, "m", 1 + rnd.int(8)).map;
      const theirs = edits(first.map, EMPTY_HISTORY, rnd, "t", 1 + rnd.int(8)).map;
      const merged = mergeMaps(first.map, mine, theirs).map;
      expect(healthy(merged), `seed ${seed}`).toBe("ok");
    }
  });

  it("undo after an outside change never leaves a map that needs repair", () => {
    let refused = 0;
    let undone = 0;
    for (const seed of SEEDS) {
      const rnd = random(seed);
      const first = start(kind);
      let { map, history } = edits(first.map, EMPTY_HISTORY, rnd, "m", 1 + rnd.int(8));
      let board: BoardContent | null;
      ({ map, board } = outside(map, first.board, rnd, 1 + rnd.int(4)));
      expect(healthy(map), `seed ${seed} outside`).toBe("ok");
      for (let step = undo(history, map); step; step = undo(history, map)) {
        const taken = take(step, map, board);
        history = taken.refused ? { past: [], future: history.future } : step.history;
        if (taken.refused) refused++;
        else undone++;
        map = taken.map;
        expect(healthy(map), `seed ${seed}`).toBe("ok");
        board = saved(board, map);
      }
    }
    // Both outcomes were exercised.
    expect(refused).toBeGreaterThan(0);
    expect(undone).toBeGreaterThan(0);
  });

  it("redo after an outside change never leaves a map that needs repair", () => {
    for (const seed of SEEDS) {
      const rnd = random(seed);
      const first = start(kind);
      let { map, history } = edits(first.map, EMPTY_HISTORY, rnd, "m", 1 + rnd.int(8));
      for (let i = rnd.int(history.past.length + 1); i > 0; i--) ({ map, history } = undo(history, map)!);
      let board: BoardContent | null;
      ({ map, board } = outside(map, first.board, rnd, 1 + rnd.int(4)));
      for (let step = redo(history, map); step; step = redo(history, map)) {
        const taken = take(step, map, board);
        history = taken.refused ? { past: history.past, future: [] } : step.history;
        map = taken.map;
        expect(healthy(map), `seed ${seed}`).toBe("ok");
        board = saved(board, map);
      }
    }
  });
});
