import { MAX_CARDS_PER_LIST } from "./boardRecord";
import { nextSteps } from "./order";
import type { LinkId, LinkMap, MapKind, NodeId } from "./types";

/**
 * The map's rules, per kind -- answered here and only here:
 *
 *  - `canLink`: may this arrow be drawn? The UI asks while dragging (to show
 *    a box as a valid drop target) and the map edit asks again before
 *    adding, so the rule can never drift between the two.
 *  - `canDeleteBox` / `canDeleteLink`: may this box or arrow go? The UI
 *    asks to show or hide its bin and ×; the store asks again before
 *    deleting.
 *  - `canSetStatus`: may this box be marked keep / maybe / cut? The
 *    toolbar, menus and keys ask to offer it; the store asks again.
 *  - `canCollapse`: may this box's branch be folded away? Only a tree's
 *    box with next steps.
 *  - `canAddNextStep`: may this box get a new next step? The toolbar, menu,
 *    "Add box" and the connect dot ask to offer it; the store asks again.
 *  - `canMove`: may this box (with its branch) become a next step of that
 *    box? The drag asks to show a drop target; the store asks again.
 *  - `canPaste`: may copied boxes (with the arrows between them) be pasted
 *    or duplicated in? The UI asks to offer Copy, Paste and Duplicate; the
 *    store asks again before pasting.
 *
 * A new kind is one more entry in `RULES`, not edits spread through the UI.
 * A tree linked to a Boardkit board (`linkedBoard`) gets its own, stricter
 * set (`linkedTree`): it must keep a board's shape.
 */

export type LinkRefusal =
  /** One of the boxes does not exist (deleted mid-drag). */
  | "missing"
  /** A box cannot link to itself. */
  | "self"
  /** This exact arrow (same direction) is already there. */
  | "duplicate"
  /** Tree: nothing may lead into the start. */
  | "start"
  /** Tree: the arrow would close a loop (the target already leads, step by
      step, back to where the arrow starts). */
  | "loop"
  /** Linked tree: the target already has its way in (a card is in one
      list only). */
  | "two-ways-in";

export type MoveRefusal =
  /** One of the boxes does not exist. */
  | "missing"
  /** Only a tree's boxes have a parent. */
  | "not-tree"
  /** The start has no parent: it is the question itself. */
  | "start"
  /** A box can't go under itself. */
  | "self"
  /** The new parent is inside the branch being moved: a loop. */
  | "inside"
  /** The box has two ways in and the new parent is neither: which way in
      would it replace? (Reordering under either parent is fine.) */
  | "two-ways-in"
  /** Linked tree: a list stays a list and a card a card. */
  | "level"
  /** Linked tree: the list already shows Boardkit's most cards. */
  | "full";

export type MoveVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: MoveRefusal };

export type LinkVerdict ={ readonly ok: true } | { readonly ok: false; readonly reason: LinkRefusal };

interface KindRules {
  readonly canLink: (map: LinkMap, from: NodeId, to: NodeId) => LinkVerdict;
  readonly canDeleteBox: (map: LinkMap, id: NodeId) => boolean;
  readonly canDeleteLink: (map: LinkMap, id: LinkId) => boolean;
  readonly canPaste: (map: LinkMap) => boolean;
  readonly canSetStatus: (map: LinkMap, id: NodeId) => boolean;
  readonly canCollapse: (map: LinkMap, id: NodeId) => boolean;
  readonly canAddNextStep: (map: LinkMap, id: NodeId) => boolean;
  readonly canMove: (map: LinkMap, id: NodeId, parent: NodeId) => MoveVerdict;
}

const OK: LinkVerdict = { ok: true };
const refuse = (reason: LinkRefusal): LinkVerdict => ({ ok: false, reason });
const MOVE_OK: MoveVerdict = { ok: true };
const refuseMove = (reason: MoveRefusal): MoveVerdict => ({ ok: false, reason });

/** The boxes leading into `id`. */
export function parentsOf(map: LinkMap, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  for (const link of Object.values(map.links)) if (link.to === id && !out.includes(link.from)) out.push(link.from);
  return out;
}

/** The checks every kind shares: both boxes exist, two different boxes,
    not an exact repeat. */
export function basicLinkCheck(map: LinkMap, from: NodeId, to: NodeId): LinkVerdict {
  if (!map.nodes[from] || !map.nodes[to]) return refuse("missing");
  if (from === to) return refuse("self");
  for (const link of Object.values(map.links)) {
    if (link.from === from && link.to === to) return refuse("duplicate");
  }
  return OK;
}

/** How many arrows lead into a box. */
export function arrowsInto(map: LinkMap, id: NodeId): number {
  let n = 0;
  for (const link of Object.values(map.links)) if (link.to === id) n++;
  return n;
}

/**
 * A tree's start: a box with nothing leading into it. A tree has exactly
 * one; every other box is reached by at least one arrow (a new step comes
 * with its arrow in the same edit, see tree.ts).
 */
export const isStart = (map: LinkMap, id: NodeId): boolean =>
  map.kind === "tree" && !!map.nodes[id] && arrowsInto(map, id) === 0;

/** The deepest level a board has room for: start (the board), lists,
    cards. */
export const BOARD_LEVELS = 3;

/**
 * A box's level in a tree whose boxes each have one way in: the start is 1,
 * its next steps 2, and so on, counted back along the arrows. `null` when
 * the way back isn't a straight line to a start (a box with two ways in,
 * or a loop): not a board's shape.
 */
export function levelOf(map: LinkMap, id: NodeId): number | null {
  const parent = new Map<NodeId, NodeId | null>();
  for (const link of Object.values(map.links)) {
    if (!map.nodes[link.from]) continue;
    parent.set(link.to, parent.has(link.to) ? null : link.from);
  }
  const seen = new Set<NodeId>([id]);
  let level = 1;
  let at = parent.get(id);
  while (at !== undefined) {
    if (at === null || seen.has(at)) return null;
    seen.add(at);
    level++;
    at = parent.get(at);
  }
  return level;
}

/** Whether `from` can be reached from `to` by following arrows forward. */
function leadsTo(map: LinkMap, to: NodeId, from: NodeId): boolean {
  const next = new Map<NodeId, NodeId[]>();
  for (const link of Object.values(map.links)) next.set(link.from, [...(next.get(link.from) ?? []), link.to]);
  const seen = new Set<NodeId>([to]);
  const stack = [to];
  let id: NodeId | undefined;
  while ((id = stack.pop()) !== undefined) {
    if (id === from) return true;
    for (const n of next.get(id) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return false;
}

/**
 * Connections: anything may need anything else. Loops are allowed (real
 * dependencies do loop), and so is the reverse arrow of an existing one;
 * only an exact repeat is refused. Every box and arrow may be deleted.
 */
const connections: KindRules = {
  canLink: basicLinkCheck,
  canDeleteBox: (map, id) => !!map.nodes[id],
  canDeleteLink: (map, id) => !!map.links[id],
  canPaste: () => true,
  // Statuses are a decision tree's idea.
  canSetStatus: () => false,
  canCollapse: () => false,
  // Next steps are a tree's idea; here a new box stands on its own.
  canAddNextStep: () => false,
  // Boxes have no parent here; a drag only moves them on the page.
  canMove: () => refuseMove("not-tree"),
};

/**
 * Tree: an arrow reads "from leads to to". A box may have two (or more)
 * parents -- "rent" and "buy" can both lead to "live near the office" --
 * but nothing leads into the start, and no path may come back round to
 * where it began. The start can't be deleted, and neither can a box's only
 * way in (that would leave a loose box).
 */
const tree: KindRules = {
  canLink: (map, from, to) => {
    const basic = basicLinkCheck(map, from, to);
    if (!basic.ok) return basic;
    if (arrowsInto(map, to) === 0) return refuse("start");
    if (leadsTo(map, to, from)) return refuse("loop");
    return OK;
  },
  canDeleteBox: (map, id) => !!map.nodes[id] && !isStart(map, id),
  canDeleteLink: (map, id) => {
    const link = map.links[id];
    return !!link && arrowsInto(map, link.to) > 1;
  },
  // A pasted box would arrive with no way into it: a loose box.
  canPaste: () => false,
  // Every box, the start too (Treekit's root can be kept or cut): a cut
  // start greys the whole tree.
  canSetStatus: (map, id) => !!map.nodes[id],
  canCollapse: (map, id) => !!map.nodes[id] && Object.values(map.links).some((l) => l.from === id && map.nodes[l.to]),
  canAddNextStep: (map, id) => !!map.nodes[id],
  // The arrow in gets a new start, so the box keeps its one way in. With
  // two ways in it can only be reordered under one of them: there is no
  // telling which way in a new parent would replace.
  canMove: (map, id, parent) => {
    if (!map.nodes[id] || !map.nodes[parent]) return refuseMove("missing");
    if (id === parent) return refuseMove("self");
    const parents = parentsOf(map, id);
    if (parents.length === 0) return refuseMove("start");
    if (leadsTo(map, id, parent)) return refuseMove("inside");
    if (parents.length > 1 && !parents.includes(parent)) return refuseMove("two-ways-in");
    return MOVE_OK;
  },
};

/**
 * A tree linked to a Boardkit board: the start is the board, its next steps
 * lists, theirs cards, and nothing deeper (decided, PROJECT.md's Bridge
 * mapping). So on top of the tree rules: no second way into a box (a card
 * is in one list), and no next step under a card. Every box but the start
 * already has its way in, so no arrow may be drawn between two boxes at
 * all; a new step comes with its own arrow.
 *
 * The store still checks the board's shape after each edit (`linkedProblem`
 * in bridge.ts) as the last guard: an edit these rules don't foresee, or a
 * tree that arrived from another tab already out of shape.
 */
const linkedTree: KindRules = {
  ...tree,
  // The start is the board in Boardkit, which has no status.
  canSetStatus: (map, id) => !!map.nodes[id] && !isStart(map, id),
  canLink: (map, from, to) => {
    const verdict = tree.canLink(map, from, to);
    if (!verdict.ok) return verdict;
    return arrowsInto(map, to) > 0 ? refuse("two-ways-in") : OK;
  },
  canAddNextStep: (map, id) => {
    if (!map.nodes[id]) return false;
    const level = levelOf(map, id);
    return level !== null && level < BOARD_LEVELS;
  },
  // A move never changes level (decided): a card goes to another list or
  // is reordered, a list is only reordered. A list takes at most
  // Boardkit's number of cards (counted here as the cards the tree shows;
  // the board's hidden dividers and notes are checked when it is written).
  canMove: (map, id, parent) => {
    const verdict = tree.canMove(map, id, parent);
    if (!verdict.ok) return verdict;
    const level = levelOf(map, id);
    const parentLevel = levelOf(map, parent);
    if (level === null || parentLevel === null || parentLevel + 1 !== level) return refuseMove("level");
    const home = parentsOf(map, id)[0];
    if (home !== parent && nextSteps(map, parent).length >= MAX_CARDS_PER_LIST) return refuseMove("full");
    return MOVE_OK;
  },
};

const RULES: Record<MapKind, KindRules> = { connections, tree };

const rulesOf = (map: LinkMap): KindRules =>
  map.kind === "tree" && map.linkedBoard !== undefined ? linkedTree : RULES[map.kind];

export function canLink(map: LinkMap, from: NodeId, to: NodeId): LinkVerdict {
  return rulesOf(map).canLink(map, from, to);
}

export const canDeleteBox = (map: LinkMap, id: NodeId): boolean => rulesOf(map).canDeleteBox(map, id);

export const canDeleteLink = (map: LinkMap, id: LinkId): boolean => rulesOf(map).canDeleteLink(map, id);

export const canPaste = (map: LinkMap): boolean => rulesOf(map).canPaste(map);

export const canSetStatus = (map: LinkMap, id: NodeId): boolean => rulesOf(map).canSetStatus(map, id);

export const canCollapse = (map: LinkMap, id: NodeId): boolean => rulesOf(map).canCollapse(map, id);

export const canAddNextStep = (map: LinkMap, id: NodeId): boolean => rulesOf(map).canAddNextStep(map, id);

/** Why no next step may be added under `id`, in words; `null` when one
    may (or the box is gone). For the message when it is refused anyway. */
export function nextStepRefusal(map: LinkMap, id: NodeId): string | null {
  const node = map.nodes[id];
  if (!node || canAddNextStep(map, id)) return null;
  if (map.kind !== "tree") return "Next steps need tree rules on.";
  return `“${node.name || "Untitled"}” is a card, and cards can't have next steps in Boardkit.`;
}

export const canMove = (map: LinkMap, id: NodeId, parent: NodeId): MoveVerdict =>
  rulesOf(map).canMove(map, id, parent);

/** Why `id` may not go under `parent`, in words: the chip beside the
    pointer while dragging, and the message if the store refuses anyway. */
export function moveRefusalText(map: LinkMap, id: NodeId, parent: NodeId, reason: MoveRefusal): string {
  const name = (box: NodeId) => `“${map.nodes[box]?.name || "Untitled"}”`;
  switch (reason) {
    case "missing":
      return "That box is gone.";
    case "not-tree":
      return "Next steps need tree rules on.";
    case "start":
      return `${name(id)} is the start: it can't go under another box.`;
    case "self":
      return "A box can't go under itself.";
    case "inside":
      return `${name(parent)} is inside the branch you're moving.`;
    case "two-ways-in":
      return `${name(id)} has two ways in: delete one to move it elsewhere.`;
    case "level":
      if (levelOf(map, parent) === BOARD_LEVELS) {
        return `${name(parent)} is a card, and cards can't have next steps in Boardkit.`;
      }
      return levelOf(map, id) === BOARD_LEVELS
        ? `${name(id)} is a card in Boardkit: it can only go into a list.`
        : `${name(id)} is a list in Boardkit: lists can only be reordered.`;
    case "full":
      return `${name(parent)} already has ${MAX_CARDS_PER_LIST} cards, Boardkit's most.`;
  }
}

/** Why an arrow may not go from `from` to `to`, in words: the chip while
    an arrow is dragged over a box, and the hint if it is let go there. */
export function linkRefusalText(map: LinkMap, from: NodeId, to: NodeId, reason: LinkRefusal): string {
  const name = (box: NodeId) => `“${map.nodes[box]?.name || "Untitled"}”`;
  switch (reason) {
    case "missing":
      return "That box is gone.";
    case "self":
      return "An arrow can't lead from a box to itself.";
    case "duplicate":
      return `${name(from)} already has that arrow to ${name(to)}.`;
    case "start":
      return `${name(to)} is the start: nothing leads into it.`;
    case "loop":
      return `${name(to)} already leads to ${name(from)}: that would go round in a circle.`;
    case "two-ways-in":
      return `${name(to)} already has its way in: in Boardkit a card is in one list only.`;
  }
}

/** Why the arrow `id` may not be deleted, in words (`null` when it may):
    in a tree it is a box's only way in, and every box needs a parent. */
export function linkDeleteRefusal(map: LinkMap, id: LinkId): string | null {
  if (!map.links[id] || canDeleteLink(map, id)) return null;
  return "With tree rules on, every box needs a parent: drag the box to a new parent, or delete the box.";
}

/** Why the box `id` may not be deleted, in words (`null` when it may). */
export function boxDeleteRefusal(map: LinkMap, id: NodeId): string | null {
  if (!map.nodes[id] || canDeleteBox(map, id)) return null;
  return `“${map.nodes[id].name || "Untitled"}” is the start, the question itself: rename it rather than delete it.`;
}
