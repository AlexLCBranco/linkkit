import { parentsFirst } from "./graph";
import { looksCut } from "./status";
import type { Link, LinkId, LinkMap, MapNode, NodeId } from "./types";

/**
 * What of a tree is on the page. Two things take boxes off it, by the same
 * "every way in" rule:
 *
 *  - "Hide cut" (`map.hideCut`): every box that looks cut (`status.ts`).
 *  - Collapse (`map.collapsed`): a box is folded away when every way into
 *    it comes from a collapsed box or from a box that is off the page
 *    itself. So a box another parent still shows stays.
 *
 * Off the page means not drawn, not laid out by Tidy up, not lit by the
 * highlight nor counted. Boxes keep their saved places for when they come
 * back. A connections map always shows everything.
 */

let cached: { map: LinkMap; hidden: ReadonlySet<NodeId>; shown: LinkMap } | null = null;

function compute(map: LinkMap): { hidden: ReadonlySet<NodeId>; shown: LinkMap } {
  const hidden = new Set<NodeId>();
  if (map.kind !== "tree" || (!map.hideCut && map.collapsed.length === 0)) return { hidden, shown: map };
  const cut = map.hideCut ? looksCut(map) : new Set<NodeId>();
  const folded = new Set(map.collapsed);
  const { order, parents } = parentsFirst(map);
  const judged = new Set(order);
  for (const id of order) {
    const ins = parents.get(id) ?? [];
    // The start always shows (greyed when cut), so a tree never vanishes.
    if ((cut.has(id) && ins.length > 0) || (ins.length > 0 && ins.every((p) => hidden.has(p) || folded.has(p)))) hidden.add(id);
  }
  for (const id of cut) if (!judged.has(id)) hidden.add(id);
  if (hidden.size === 0) return { hidden, shown: map };
  const nodes = Object.fromEntries(Object.values(map.nodes).filter((n) => !hidden.has(n.id)).map((n) => [n.id, n]));
  const links = Object.fromEntries(
    Object.values(map.links)
      .filter((l) => !hidden.has(l.from) && !hidden.has(l.to))
      .map((l) => [l.id, l]),
  );
  return {
    hidden,
    shown: { ...map, nodes: nodes as Record<NodeId, MapNode>, links: links as Record<LinkId, Link> },
  };
}

function shownOf(map: LinkMap) {
  if (cached?.map !== map) cached = { map, ...compute(map) };
  return cached;
}

/**
 * The map as it shows: without the boxes that are off the page, and every
 * arrow touching them. What the canvas draws, Tidy up lays out and the
 * highlight walks. The same object when nothing is off the page, and the
 * same result for the same map, so it can be read freely while rendering.
 */
export const shownMap = (map: LinkMap): LinkMap => shownOf(map).shown;

/** The boxes off the page (hidden cut, or folded away). */
export const hiddenBoxes = (map: LinkMap): ReadonlySet<NodeId> => shownOf(map).hidden;

/** How many boxes after `id` are off the page: the "+N" on a collapsed
    box. Walks forward through hidden boxes only. */
export function hiddenAfter(map: LinkMap, id: NodeId): number {
  const hidden = hiddenBoxes(map);
  const next = new Map<NodeId, NodeId[]>();
  for (const { from, to } of Object.values(map.links)) next.set(from, [...(next.get(from) ?? []), to]);
  const seen = new Set<NodeId>();
  const stack = [id];
  let at: NodeId | undefined;
  while ((at = stack.pop()) !== undefined) {
    for (const n of next.get(at) ?? []) {
      if (hidden.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size;
}
