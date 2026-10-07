import { isShownCard, MAX_CARDS_PER_LIST, type BoardContent, type BoardItem } from "./boardRecord";
import { nextSteps } from "./order";
import { arrowsInto } from "./rules";
import { startOf } from "./tree";
import type {
  ArrowLength,
  LayoutDirection,
  Link,
  LinkId,
  LinkMap,
  MapId,
  MapNode,
  NodeId,
  NodeStatus,
  PaletteColor,
  Point,
  Size,
} from "./types";
import { NODE_STATUSES } from "./types";

/**
 * A linked tree <-> its Boardkit board (bridge step 3; the field mapping is
 * in PROJECT.md, "Bridge mapping"). Pure: the store reads and writes the
 * records.
 *
 * The start box is the board, its next steps are the lists, theirs the
 * cards; nothing goes deeper. Ids are shared as they are: the start box's
 * id is the board's, and the arrow into a box has that box's id (a linked
 * tree has one way into each box, so it is unique), which is also what
 * Linkkit's arrow labels are kept by.
 *
 * Only shared fields cross over. Linkkit's own parts of a linked map (box
 * places and colours, labels, collapse, ...) are its `LinkedView`; Boardkit's
 * own parts (pregame / postgame text, dividers, notes, colours) stay in the
 * board record, untouched.
 */

/** Linkkit's own parts of a linked map: what its slimmed record keeps. */
export interface LinkedView {
  readonly page: Size;
  readonly direction: LayoutDirection;
  readonly arrowLength: ArrowLength;
  readonly hideCut: boolean;
  readonly collapsed: readonly NodeId[];
  /** Box centres, by box. A box with none (added in Boardkit) is unplaced. */
  readonly places: Readonly<Record<NodeId, Point>>;
  /** Box colours, by box; a box with none has the default style. */
  readonly colors: Readonly<Record<NodeId, PaletteColor>>;
  /** Arrow labels, by the box the arrow points into, so a card moved to
      another list keeps its label (decided for 14b). */
  readonly labels: Readonly<Record<NodeId, string>>;
}

/** The `LinkedView` of a map: what Linkkit keeps of it once linked. */
export function viewOf(map: LinkMap): LinkedView {
  const places: Record<NodeId, Point> = {};
  const colors: Record<NodeId, PaletteColor> = {};
  const labels: Record<NodeId, string> = {};
  for (const node of Object.values(map.nodes)) {
    places[node.id] = { x: node.x, y: node.y };
    if (node.color) colors[node.id] = node.color;
  }
  for (const link of Object.values(map.links)) if (link.label) labels[link.to] = link.label;
  const { page, direction, arrowLength, hideCut, collapsed } = map;
  return { page, direction, arrowLength, hideCut, collapsed, places, colors, labels };
}

const statusOf = (item: BoardItem): NodeStatus | null =>
  NODE_STATUSES.includes(item.status as NodeStatus) ? (item.status as NodeStatus) : null;

/**
 * The tree a board makes, with Linkkit's own `view` laid over it. Trashed
 * lists and cards are not in it, nor are dividers and notes. `unplaced` are
 * the boxes the view has no place for (made in Boardkit since): they sit at
 * 0, 0 until the caller tidies them in.
 */
export function boardToTree(
  boardId: string,
  boardName: string,
  board: BoardContent,
  view: LinkedView,
): { map: LinkMap; unplaced: NodeId[] } {
  const nodes: Record<NodeId, MapNode> = {};
  const links: Record<LinkId, Link> = {};
  const order: Record<NodeId, readonly NodeId[]> = {};
  const unplaced: NodeId[] = [];

  const addBox = (id: NodeId, name: string, status: NodeStatus | null, parent: NodeId | null) => {
    const place = view.places[id];
    if (!place) unplaced.push(id);
    nodes[id] = { id, name, x: place?.x ?? 0, y: place?.y ?? 0, color: view.colors[id] ?? null, status };
    if (parent) {
      const linkId = id as string as LinkId;
      links[linkId] = { id: linkId, from: parent, to: id, label: view.labels[id] ?? "" };
      order[parent] = [...(order[parent] ?? []), id];
    }
  };

  const start = boardId as NodeId;
  addBox(start, boardName, null, null);
  for (const listId of board.listOrder) {
    const id = listId as NodeId;
    if (nodes[id]) continue;
    addBox(id, board.lists[listId].title, statusOf(board.lists[listId]), start);
    for (const cardId of board.cardOrder[listId] ?? []) {
      const card = board.cards[cardId];
      if (!isShownCard(card) || nodes[cardId as NodeId]) continue;
      addBox(cardId as NodeId, card.title, statusOf(card), id);
    }
  }

  const map: LinkMap = {
    id: boardId as MapId,
    name: boardName,
    kind: "tree",
    page: view.page,
    direction: view.direction,
    arrowLength: view.arrowLength,
    nodes,
    links,
    order,
    hideCut: view.hideCut,
    collapsed: view.collapsed.filter((id) => nodes[id]),
    trash: [],
  };
  return { map, unplaced };
}

/** Why a tree can't be (or stay) a board, one box at a time. */
export type BoardProblem =
  /** Not a tree, or one without a start. */
  | { readonly kind: "not-a-tree" }
  /** A box two arrows lead into: a card is in one list only. */
  | { readonly kind: "two-ways-in"; readonly box: NodeId }
  /** A box below the cards (level 4: start, list, card, this). Only the
      top one of a branch is named: fixing it fixes the rest. */
  | { readonly kind: "too-deep"; readonly box: NodeId; readonly level: number }
  /** A list that became a card, or a card that became a list. */
  | { readonly kind: "changes-level"; readonly box: NodeId }
  /** A list with more cards than Boardkit allows. */
  | { readonly kind: "list-full"; readonly box: NodeId };

/** The deepest level a board has room for: start, lists, cards. */
export const BOARD_LEVELS = 3;

/**
 * What stops `map` from being a board: every box with two ways in, and the
 * top box of each branch that goes deeper than cards. Empty when it fits.
 * "Link to Boardkit" names each one; nothing is fixed automatically.
 */
export function boardProblems(map: LinkMap): BoardProblem[] {
  const start = map.kind === "tree" ? startOf(map) : null;
  if (!start) return [{ kind: "not-a-tree" }];
  const problems: BoardProblem[] = [];
  for (const id of Object.keys(map.nodes) as NodeId[]) {
    if (arrowsInto(map, id) > 1) problems.push({ kind: "two-ways-in", box: id });
  }
  // Breadth first, so each box gets its shallowest level.
  const level = new Map<NodeId, number>([[start, 1]]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    const here = level.get(id)!;
    for (const child of nextSteps(map, id)) {
      if (level.has(child)) continue;
      level.set(child, here + 1);
      if (here + 1 > BOARD_LEVELS) problems.push({ kind: "too-deep", box: child, level: here + 1 });
      else queue.push(child);
    }
  }
  return problems;
}

/** A problem in words, for the message that refuses the link or the
    change ("'Rent' has two ways in"). */
export function problemText(map: LinkMap, problem: BoardProblem): string {
  if (problem.kind === "not-a-tree") return "Only a tree with one start can be a board.";
  const name = `"${map.nodes[problem.box]?.name || "Untitled"}"`;
  switch (problem.kind) {
    case "two-ways-in":
      return `${name} has two ways in.`;
    case "too-deep":
      return `${name} is ${problem.level} levels deep.`;
    case "changes-level":
      return `${name} can't change between a list and a card.`;
    case "list-full":
      return `${name} would have more than ${MAX_CARDS_PER_LIST} cards.`;
  }
}

/** An item with `node`'s name and status, everything else kept. The same
    object when neither changed. */
function patched(item: BoardItem, node: MapNode): BoardItem {
  const status = statusOf(item);
  if (item.title === node.name && status === node.status) return item;
  const next: Record<string, unknown> = { ...item, title: node.name };
  if (node.status) next.status = node.status;
  else delete next.status;
  return next as BoardItem;
}

const newItem = (node: MapNode): BoardItem => ({ id: node.id, title: node.name, ...(node.status ? { status: node.status } : {}) });

/** Longest common subsequence of two id lists: the cards that kept their
    order relative to each other, so only the others count as moved. */
function keptInOrder(a: readonly string[], b: readonly string[]): Set<string> {
  const n = a.length;
  const m = b.length;
  const len: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      len[i][j] = a[i] === b[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1]);
    }
  }
  const kept = new Set<string>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) {
      kept.add(a[i]);
      i++;
      j++;
    } else if (len[i + 1][j] > len[i][j + 1]) i++;
    // On a tie (two cards swapped), the one now higher counts as moved: a
    // card dragged up, not its neighbour dragged down.
    else j++;
  }
  return kept;
}

/**
 * A list's new card order: `stored` (everything Boardkit has in the list)
 * changed so its shown cards read `shown`, with dividers and notes never
 * moving (decided, Bridge mapping). Cards that kept their order stay put; a
 * card that moved (or arrived) goes right after the shown card above it in
 * `shown`, joining that card's section even past a divider; at the very top,
 * right before the first shown card; in a list with no other cards, at the
 * end. A card that left the list just leaves its spot.
 */
export function arrangeCards(
  stored: readonly string[],
  shown: readonly string[],
  isShown: (id: string) => boolean,
): string[] {
  const wanted = new Set(shown);
  let order = stored.filter((id) => !isShown(id) || wanted.has(id));
  const kept = keptInOrder(
    order.filter((id) => isShown(id)),
    shown,
  );
  order = order.filter((id) => !isShown(id) || kept.has(id));
  shown.forEach((id, i) => {
    if (kept.has(id)) return;
    if (i > 0) {
      order.splice(order.indexOf(shown[i - 1]) + 1, 0, id);
      return;
    }
    const first = order.findIndex((other) => isShown(other));
    if (first === -1) order.push(id);
    else order.splice(first, 0, id);
  });
  return order;
}

export type TreeToBoard =
  | { readonly ok: true; readonly board: BoardContent; readonly name: string; readonly changed: boolean }
  | { readonly ok: false; readonly problems: readonly BoardProblem[] };

/**
 * `board` changed to match the linked tree `map`: titles and statuses,
 * which lists there are and their order, which cards each list shows and
 * theirs. Everything else on the board is kept as it is. `name` is the
 * board's name (the start box's), which Boardkit keeps in its board list,
 * not in the record.
 *
 * Deleting follows Boardkit: a box gone from the tree goes to the board's
 * trash, never erased. A list goes with its cards (Boardkit keeps a trashed
 * list whole, and they come back together); a card from a list that stays
 * goes on its own. A box back in the tree comes out of the trash.
 *
 * Refused, with the reasons, when the tree doesn't fit a board
 * (`boardProblems`), a box changes between list and card, or a list would
 * hold more cards than Boardkit allows.
 */
export function treeToBoard(board: BoardContent, map: LinkMap, deletedAt: number): TreeToBoard {
  const problems = boardProblems(map);
  if (problems.length) return { ok: false, problems };
  const start = startOf(map)!;

  const listIds: string[] = nextSteps(map, start);
  const shownCards = new Map<string, NodeId[]>(listIds.map((id) => [id, nextSteps(map, id as NodeId)]));
  const cardHome = new Map<string, string>();
  for (const [listId, cards] of shownCards) for (const id of cards) cardHome.set(id, listId);

  const levelProblems: BoardProblem[] = [];
  for (const id of listIds) if (board.cards[id]) levelProblems.push({ kind: "changes-level", box: id as NodeId });
  for (const id of cardHome.keys()) if (board.lists[id]) levelProblems.push({ kind: "changes-level", box: id as NodeId });
  if (levelProblems.length) return { ok: false, problems: levelProblems };

  // Titles and statuses, and the records of new boxes.
  const lists: Record<string, BoardItem> = { ...board.lists };
  const cards: Record<string, BoardItem> = { ...board.cards };
  for (const id of listIds) {
    const node = map.nodes[id as NodeId];
    lists[id] = board.lists[id] ? patched(board.lists[id], node) : newItem(node);
  }
  for (const id of cardHome.keys()) {
    const node = map.nodes[id as NodeId];
    cards[id] = board.cards[id] ? patched(board.cards[id], node) : newItem(node);
  }
  const isShown = (id: string) => cardHome.has(id) || isShownCard(cards[id]);

  // Lists: the tree's order. A list no longer there goes to the trash whole.
  const alive = new Set(listIds);
  const trashedLists = board.trashedLists.filter((e) => !alive.has(e.listId));
  for (const id of board.listOrder) {
    if (!alive.has(id) && !trashedLists.some((e) => e.listId === id)) trashedLists.push({ listId: id, deletedAt });
  }

  // Cards: each shown card in its list only; a card gone from a list that
  // stays goes to the trash.
  const trash = board.trash.filter((e) => !cardHome.has(e.cardId));
  const cardOrder: Record<string, readonly string[]> = {};
  for (const [listId, ids] of Object.entries(board.cardOrder)) {
    if (!alive.has(listId)) {
      // A trashed list keeps its cards; one moved out first leaves it.
      cardOrder[listId] = ids.filter((id) => !cardHome.has(id));
      continue;
    }
    for (const id of ids) {
      if (isShownCard(board.cards[id]) && !cardHome.has(id)) trash.push({ cardId: id, listId, deletedAt });
    }
  }
  const full: BoardProblem[] = [];
  for (const listId of listIds) {
    const before = board.cardOrder[listId] ?? [];
    const next = arrangeCards(before, shownCards.get(listId)!, isShown);
    if (next.length > MAX_CARDS_PER_LIST && next.length > before.length) full.push({ kind: "list-full", box: listId as NodeId });
    cardOrder[listId] = next;
  }
  if (full.length) return { ok: false, problems: full };

  const next: BoardContent = { ...board, lists, cards, listOrder: listIds, cardOrder, trash, trashedLists };
  return { ok: true, board: next, name: map.nodes[start].name, changed: !sameContent(board, next) };
}

const sameIds = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
  (a ?? []).length === (b ?? []).length && (a ?? []).every((id, i) => id === b![i]);

/** Whether two boards hold the same shared fields (items compared by
    object: `treeToBoard` keeps an unchanged one as it is). */
function sameContent(a: BoardContent, b: BoardContent): boolean {
  const sameItems = (x: Readonly<Record<string, BoardItem>>, y: Readonly<Record<string, BoardItem>>) =>
    Object.keys(x).length === Object.keys(y).length && Object.keys(x).every((k) => x[k] === y[k]);
  const orderKeys = new Set([...Object.keys(a.cardOrder), ...Object.keys(b.cardOrder)]);
  return (
    sameItems(a.lists, b.lists) &&
    sameItems(a.cards, b.cards) &&
    sameIds(a.listOrder, b.listOrder) &&
    [...orderKeys].every((k) => sameIds(a.cardOrder[k], b.cardOrder[k])) &&
    a.trash.length === b.trash.length &&
    a.trash.every((e, i) => e === b.trash[i]) &&
    a.trashedLists.length === b.trashedLists.length &&
    a.trashedLists.every((e, i) => e === b.trashedLists[i])
  );
}

/**
 * A linked map as it opens (or as another app's save is taken in): the
 * tree its board makes, with Linkkit's own parts taken from `copy`, the map
 * as Linkkit last stored it. The map keeps its own id and link. `boardName`
 * is the name in Boardkit's board list; when it isn't there, the copy's.
 *
 * The trash stays Linkkit's for now (the copy's, less any box that is back
 * on the map): sending a linked map's deletes to Boardkit's trash only is a
 * later step. `unplaced`: boxes made in Boardkit since, to tidy in.
 */
export function linkedTree(
  copy: LinkMap,
  boardName: string | null,
  board: BoardContent,
): { map: LinkMap; unplaced: NodeId[] } {
  const boardId = copy.linkedBoard ?? copy.id;
  const name = boardName ?? copy.nodes[boardId as NodeId]?.name ?? copy.name;
  const built = boardToTree(boardId, name, board, viewOf(copy));
  const trash = copy.trash.filter((entry) => entry.nodes.every((n) => !built.map.nodes[n.id]));
  const map: LinkMap = { ...built.map, id: copy.id, trash, ...(copy.linkedBoard ? { linkedBoard: copy.linkedBoard } : {}) };
  return { map, unplaced: built.unplaced };
}

/** The map as an ordinary tree, no longer linked (its board was deleted
    in Boardkit). The same object when it wasn't linked. */
export function unlinked(map: LinkMap): LinkMap {
  if (map.linkedBoard === undefined) return map;
  const { linkedBoard: _, ...rest } = map;
  return rest;
}

/** A linked map's name is its start box's (the board's name): one name
    that can't drift. The same object when it already is, or not linked. */
export function withStartName(map: LinkMap): LinkMap {
  const start = map.linkedBoard ? map.nodes[map.linkedBoard as NodeId] : undefined;
  return start && start.name && start.name !== map.name ? { ...map, name: start.name } : map;
}

/**
 * Why `map` can't be a linked tree's next state, in words, or `null` when
 * it can (or isn't linked). An edit that breaks the board's shape (a third
 * level under a card, a second way into a box) is refused with this.
 */
export function linkedProblem(map: LinkMap): string | null {
  if (!map.linkedBoard) return null;
  const [problem] = boardProblems(map);
  return problem ? problemText(map, problem) : null;
}
