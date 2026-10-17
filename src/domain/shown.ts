import { roundsFor } from "./bracket";
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
 *
 * A bracket has its own: its first `hiddenRounds` rounds are off the page
 * (the header's "Rounds" menu), so the rest reads cleaner. That one is a
 * view choice, not part of the map: the caller passes it in.
 */

let cached: { map: LinkMap; rounds: number; hidden: ReadonlySet<NodeId>; shown: LinkMap } | null = null;

/** How many of a bracket's first rounds may be hidden at most: all but
    the final, which always shows. 0 for any other map. */
export const hidableRounds = (map: LinkMap): number =>
  map.kind === "bracket" ? Math.max(0, roundsFor(Object.values(map.nodes).filter((n) => n.match).length + 1) - 1) : 0;

/** `rounds` brought into range for this map (0 up to `hidableRounds`). */
export const clampRounds = (map: LinkMap, rounds: number): number =>
  Math.min(Math.max(0, Math.floor(rounds) || 0), hidableRounds(map));

function compute(map: LinkMap, rounds: number): { hidden: ReadonlySet<NodeId>; shown: LinkMap } {
  const hidden = new Set<NodeId>();
  if (map.kind === "bracket") {
    const off = clampRounds(map, rounds);
    for (const n of Object.values(map.nodes)) if (n.match && n.match.round <= off) hidden.add(n.id);
    return without(map, hidden);
  }
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
  return without(map, hidden);
}

/** `map` less the `hidden` boxes and every arrow touching them. */
function without(map: LinkMap, hidden: ReadonlySet<NodeId>): { hidden: ReadonlySet<NodeId>; shown: LinkMap } {
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

function shownOf(map: LinkMap, rounds: number) {
  if (cached?.map !== map || cached.rounds !== rounds) cached = { map, rounds, ...compute(map, rounds) };
  return cached;
}

/**
 * The map as it shows: without the boxes that are off the page, and every
 * arrow touching them. What the canvas draws, Tidy up lays out and the
 * highlight walks. The same object when nothing is off the page, and the
 * same result for the same map, so it can be read freely while rendering.
 */
export const shownMap = (map: LinkMap, hiddenRounds = 0): LinkMap => shownOf(map, hiddenRounds).shown;

/** The boxes off the page (hidden cut, or folded away). */
export const hiddenBoxes = (map: LinkMap): ReadonlySet<NodeId> => shownOf(map, 0).hidden;

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
