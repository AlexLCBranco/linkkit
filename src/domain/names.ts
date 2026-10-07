import { startOf } from "./tree";
import type { LinkMap, NodeId } from "./types";

/**
 * Names you can tell apart (usability pass U11): no two maps (or saved
 * templates) show the same name in a list.
 */

export const UNTITLED_MAP = "Untitled map";

/** "Untitled map", "Untitled map 2", ...: a name nobody has typed yet. */
export function isUntitled(name: string): boolean {
  return name === UNTITLED_MAP || /^Untitled map \d+$/.test(name);
}

/** `base` if no one has it yet, else "base 2", "base 3", ...: the first one free. */
export function numberedName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!names.has(candidate)) return candidate;
  }
}

/**
 * What a list shows for each entry (oldest first): its own name, except
 * that a later entry repeating an earlier one's name gets the next free
 * number ("Rent", "Rent 2"). Only for showing: stored names, which the user
 * may have typed, stay as they are. Entries keyed by id.
 */
export function displayNames(entries: readonly { readonly id: string; readonly name: string }[]): Map<string, string> {
  const taken = new Set(entries.map((e) => e.name));
  const seen = new Set<string>();
  const out = new Map<string, string>();
  for (const { id, name } of entries) {
    if (!seen.has(name)) {
      seen.add(name);
      out.set(id, name);
      continue;
    }
    const shown = numberedName(name, taken);
    taken.add(shown);
    out.set(id, shown);
  }
  return out;
}

/** The box a map is named after: a tree's start, otherwise its first box
    (the oldest; boxes are stored in the order they were made). */
export function namingBox(map: LinkMap): NodeId | null {
  if (map.kind === "tree") return startOf(map);
  for (const id in map.nodes) return id as NodeId;
  return null;
}

/**
 * A map takes its naming box's name (U9 for trees, U11 for every map): when
 * an edit renames that box (or gives a fresh map its first box), the map's
 * name follows while it is still untitled or still the box's old name. Once
 * the user names the map by hand (something else), that name sticks. Not
 * for a linked map (always its start's name, `withStartName` in bridge.ts)
 * or an edit that renamed the map itself; a blank box leaves the name as it
 * is. The same map when nothing follows.
 */
export function followBoxName(prev: LinkMap, next: LinkMap): LinkMap {
  if (next.linkedBoard || prev.name !== next.name) return next;
  const box = namingBox(next);
  const now = box ? next.nodes[box]?.name : undefined;
  if (!box || !now) return next;
  const was = prev.nodes[box]?.name;
  if (was === now) return next;
  return isUntitled(next.name) || next.name === was ? { ...next, name: now } : next;
}
