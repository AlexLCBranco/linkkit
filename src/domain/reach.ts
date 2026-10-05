import type { Link, LinkMap, NodeId } from "./types";

/**
 * "What does this box need, and what breaks without it?" -- the question
 * the whole app exists to answer.
 *
 * Arrows point from a box to what it needs, so:
 *  - needs  = everything reachable by following arrows forward;
 *  - breaks = everything reachable by following arrows backward (whatever
 *    needs this box, directly or through others).
 * Both walk each box once, so loops are safe, and the selected box itself is
 * never in either set, even when a loop leads back to it.
 */

export interface Reach {
  readonly selected: NodeId;
  readonly needs: ReadonlySet<NodeId>;
  /** Every box that breaks without the selected one, including any that is
      also in `needs` (possible only inside a loop). */
  readonly breaks: ReadonlySet<NodeId>;
}

/** How a box looks while another (or it) is selected. */
export type NodeHighlight = "selected" | "need" | "break" | "faded";
/** How an arrow looks while a box is selected. */
export type LinkHighlight = "need" | "break" | "faded";

function walk(map: LinkMap, start: NodeId, forward: boolean): Set<NodeId> {
  const next = new Map<NodeId, NodeId[]>();
  for (const link of Object.values(map.links)) {
    const [a, b] = forward ? [link.from, link.to] : [link.to, link.from];
    const list = next.get(a);
    if (list) list.push(b);
    else next.set(a, [b]);
  }
  const seen = new Set<NodeId>();
  const stack = [start];
  let id: NodeId | undefined;
  while ((id = stack.pop()) !== undefined) {
    for (const b of next.get(id) ?? []) {
      if (b === start || seen.has(b) || !map.nodes[b]) continue;
      seen.add(b);
      stack.push(b);
    }
  }
  return seen;
}

export const needsOf = (map: LinkMap, id: NodeId): Set<NodeId> => walk(map, id, true);
export const breaksOf = (map: LinkMap, id: NodeId): Set<NodeId> => walk(map, id, false);

/** `null` when nothing is selected or the selected box no longer exists. */
export function reachOf(map: LinkMap, selected: NodeId | null): Reach | null {
  if (selected === null || !map.nodes[selected]) return null;
  return { selected, needs: needsOf(map, selected), breaks: breaksOf(map, selected) };
}

/**
 * A box both needed and broken (it sits in a loop with the selected one)
 * shows as needed: teal wins, as in the prototype.
 */
export function nodeHighlight(reach: Reach, id: NodeId): NodeHighlight {
  if (id === reach.selected) return "selected";
  if (reach.needs.has(id)) return "need";
  if (reach.breaks.has(id)) return "break";
  return "faded";
}

/** An arrow lights up when it lies on a path the highlight follows. */
export function linkHighlight(reach: Reach, link: Link): LinkHighlight {
  const { selected, needs, breaks } = reach;
  if ((link.from === selected || needs.has(link.from)) && needs.has(link.to)) return "need";
  if (breaks.has(link.from) && (link.to === selected || breaks.has(link.to))) return "break";
  return "faded";
}

/** The status bar's two numbers. A box in both sets counts only once,
    under "needs", matching how it is drawn. */
export function reachCounts(reach: Reach): { needs: number; breaks: number } {
  let breaks = 0;
  for (const id of reach.breaks) if (!reach.needs.has(id)) breaks++;
  return { needs: reach.needs.size, breaks };
}
