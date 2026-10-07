import { addLink, addNode, cleanName, renameNode } from "./map";
import { canAddNextStep, parentsOf } from "./rules";
import { addNextStep } from "./tree";
import type { LinkMap, NodeId, Point } from "./types";

/**
 * Pasting an outline into a box's name (usability pass U5): several lines
 * become several boxes. Pure: the store calls it inside one undo step.
 *
 *   Party           -> the box being typed in
 *     Food          -> a new box under it (indented: a child of the line above)
 *       Cake
 *     Music         -> back out: a sibling of the line it lines up with
 *   Games           -> no indent: a sibling of the box being typed in
 *
 * Indentation is a tab or two or more spaces more than the line above;
 * bullet markers (-, *, +, •, "1.", "1)") are stripped; blank lines are
 * skipped.
 */

export interface OutlineLine {
  readonly text: string;
  /** 0: level with the first line; 1: under it; and so on. */
  readonly depth: number;
}

/** A tab counts as this many spaces of indentation. */
const TAB_WIDTH = 4;
/** How much more indentation than the line above makes a child. */
const CHILD_INDENT = 2;
const BULLET = /^(?:[-*+•‣◦▪]|\d+[.)])\s+/;

function indentOf(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += TAB_WIDTH;
    else break;
  }
  return width;
}

/** The outline's lines, with their depth relative to the first. Empty for
    text with no line that says anything. */
export function parseOutline(text: string): OutlineLine[] {
  const out: OutlineLine[] = [];
  // Each entry: an indentation and its depth, the current line's ancestors.
  const stack: { width: number; depth: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const words = cleanName(raw.trim().replace(BULLET, ""));
    if (!words) continue;
    const width = indentOf(raw);
    let depth: number;
    if (stack.length === 0) {
      depth = 0;
      stack.push({ width, depth });
    } else if (width >= stack[stack.length - 1].width + CHILD_INDENT) {
      depth = stack[stack.length - 1].depth + 1;
      stack.push({ width, depth });
    } else {
      // Back out to the line it lines up with (a space either way is
      // still lined up); further out than the first line is level with it.
      while (stack.length > 1 && width <= stack[stack.length - 1].width - CHILD_INDENT) stack.pop();
      depth = stack[stack.length - 1].depth;
      stack[stack.length - 1] = { width, depth };
    }
    out.push({ text: words, depth });
  }
  return out;
}

/** Whether pasted text is an outline (two lines or more) rather than a
    name: a single line pastes as it always has. */
export const isOutline = (text: string): boolean => parseOutline(text).length > 1;

/**
 * `map` with the outline pasted into box `id`: its first line becomes the
 * box's name (`name`, already joined with what was typed around it), every
 * other line a new box. In a tree each new box is a next step of the box
 * it sits under, and a line level with the first becomes a next step of
 * the box's parent (of the box itself when it is the start, which has
 * none), so the tree rules hold; a linked tree puts a line too deep for a
 * board under the deepest box that may take it. In a connections map a box
 * needs the box it sits under (an arrow from it), and a line level with
 * the first stands on its own. New boxes start at `at` (the caller tidies
 * them into place). `newId`: ids for the new boxes.
 */
export function pasteOutline(
  map: LinkMap,
  id: NodeId,
  name: string,
  lines: readonly OutlineLine[],
  at: Point,
  newId: () => NodeId,
): { map: LinkMap; added: NodeId[] } {
  if (!map.nodes[id]) return { map, added: [] };
  let next = renameNode(map, id, name);
  const added: NodeId[] = [];
  const tree = map.kind === "tree";
  const parent = tree ? (parentsOf(map, id)[0] ?? null) : null;
  // The box each depth's lines go under; depth 0 is the first line's
  // level. A tree's start has no parent: lines level with it go under it.
  const under: (NodeId | null)[] = [tree ? (parent ?? id) : null, id];
  for (const line of lines) {
    const depth = Math.max(0, Math.min(line.depth, under.length - 1));
    let host = under[depth];
    if (tree) {
      // A linked tree's card takes no next steps: the deepest box above
      // that may take one does.
      let level = depth;
      while (host && !canAddNextStep(next, host) && level > 0) host = under[--level];
      if (!host || !canAddNextStep(next, host)) continue;
      const step = addNextStep(next, host, at, line.text, newId());
      if (!step) continue;
      next = step.map;
      added.push(step.nodeId);
      under.length = level + 1;
      under.push(step.nodeId);
      continue;
    }
    const box = addNode(next, at, line.text, newId());
    next = box.map;
    added.push(box.nodeId);
    if (host) next = addLink(next, host, box.nodeId).map;
    under.length = depth + 1;
    under.push(box.nodeId);
  }
  return { map: next, added };
}
