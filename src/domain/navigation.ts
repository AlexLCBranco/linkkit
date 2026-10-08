import { parentsFirst } from "./graph";
import { nextSteps } from "./order";
import type { LayoutDirection, LinkMap, NodeId, Point, Size } from "./types";

/**
 * Moving the selection with the arrow keys in a tree, and keeping the
 * selected box on screen. Pure: no React, no store. Treekit's
 * `domain/navigation.ts`, for a tree that may have boxes with two parents.
 *
 * Moves follow the tree, not the screen: up to a parent, down into a next
 * step, along the row. Give it the map as it shows (`shownMap`), so folded
 * and hidden cut boxes are never landed on.
 */

/** A move in tree terms, whichever way the tree is drawn. */
export type TreeMove = "parent" | "child" | "prev" | "next";

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export const isArrowKey = (key: string): key is ArrowKey =>
  key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";

/** Top-down, ↑ is the parent and ←/→ walk the row; left-right, ← is the
    parent and ↑/↓ walk the column (Treekit's). */
export function arrowToMove(key: ArrowKey, direction: LayoutDirection): TreeMove {
  const topDown: Record<ArrowKey, TreeMove> = { ArrowUp: "parent", ArrowDown: "child", ArrowLeft: "prev", ArrowRight: "next" };
  const leftRight: Record<ArrowKey, TreeMove> = { ArrowLeft: "parent", ArrowRight: "child", ArrowUp: "prev", ArrowDown: "next" };
  return (direction === "TB" ? topDown : leftRight)[key];
}

/** Where the last moves went, so up-then-down (or down-then-up) comes back
    the way it went. Session-only view state; stale entries are ignored. */
export interface NavMemory {
  /** The next step last selected under each box. */
  readonly lastChild: ReadonlyMap<NodeId, NodeId>;
  /** The parent each box was last reached from (it may have two). */
  readonly cameFrom: ReadonlyMap<NodeId, NodeId>;
}

export const EMPTY_MEMORY: NavMemory = { lastChild: new Map(), cameFrom: new Map() };

/** The memory after selecting `to` (from `from`, or by any other means). */
export function remember(memory: NavMemory, map: LinkMap, from: NodeId | null, to: NodeId): NavMemory {
  const parents = parentsOf(map, to);
  const via = from && parents.includes(from) ? from : (memory.cameFrom.get(to) ?? parents[0]);
  if (!via) return memory;
  return {
    lastChild: new Map(memory.lastChild).set(via, to),
    cameFrom: new Map(memory.cameFrom).set(to, via),
  };
}

/** Along the row: across the page top-down, down it left-right. */
const across = (p: Point, direction: LayoutDirection) => (direction === "TB" ? p.x : p.y);

function parentsOf(map: LinkMap, id: NodeId): NodeId[] {
  const parents = Object.values(map.links)
    .filter((l) => l.to === id && map.nodes[l.from])
    .map((l) => l.from);
  return [...new Set(parents)].sort((a, b) => across(map.nodes[a], map.direction) - across(map.nodes[b], map.direction));
}

/**
 * Each box's row: one below its lowest parent, as Tidy up lays it out (the
 * start is row 0). Boxes on a loop (a damaged map) get none.
 */
export function rowsOf(map: LinkMap): Map<NodeId, number> {
  const { order, parents } = parentsFirst(map);
  const row = new Map<NodeId, number>();
  for (const id of order) {
    const above = parents.get(id) ?? [];
    row.set(id, above.length === 0 ? 0 : Math.max(...above.map((p) => row.get(p) ?? 0)) + 1);
  }
  return row;
}

/**
 * The box a move lands on, or `null` if there is nowhere to go (the start
 * has no parent, a box with no next steps showing no child, a row has ends).
 *
 *  - parent: the one it was reached from, if it has two; else the first
 *    across the page.
 *  - child: the next step last selected under it, else its first.
 *  - prev / next: the neighbour in the same row, in the order they sit on
 *    the page, crossing over to cousins, so ←/→ sweep a whole row.
 */
export function moveFrom(map: LinkMap, from: NodeId, move: TreeMove, memory: NavMemory = EMPTY_MEMORY): NodeId | null {
  if (!map.nodes[from]) return null;
  if (move === "parent") {
    const parents = parentsOf(map, from);
    const via = memory.cameFrom.get(from);
    return via && parents.includes(via) ? via : (parents[0] ?? null);
  }
  if (move === "child") {
    const children = nextSteps(map, from).filter((id) => map.nodes[id]);
    const last = memory.lastChild.get(from);
    return last && children.includes(last) ? last : (children[0] ?? null);
  }
  const rows = rowsOf(map);
  const mine = rows.get(from);
  if (mine === undefined) return null;
  const row = [...rows]
    .filter(([, r]) => r === mine)
    .map(([id]) => id)
    .sort((a, b) => across(map.nodes[a], map.direction) - across(map.nodes[b], map.direction));
  const index = row.indexOf(from);
  return row[move === "next" ? index + 1 : index - 1] ?? null;
}

export interface ScrollView {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The smallest scroll that brings a box (its centre and size, in the
 * scrolled area's pixels) plus `margin` around it into view (Treekit's).
 * Stays put when it already shows; one bigger than the view lines up with
 * its start.
 */
export function scrollToReveal(center: Point, size: Size, view: ScrollView, margin: number): { left: number; top: number } {
  const axis = (start: number, length: number, scroll: number, room: number) => {
    const lo = start - margin;
    const hi = start + length + margin;
    if (hi - lo > room || lo < scroll) return Math.max(0, lo);
    if (hi > scroll + room) return hi - room;
    return scroll;
  };
  return {
    left: axis(center.x - size.width / 2, size.width, view.left, view.width),
    top: axis(center.y - size.height / 2, size.height, view.top, view.height),
  };
}
