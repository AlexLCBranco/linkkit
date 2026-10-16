import { pathTo } from "./bracket";
import type { Link, LinkMap, MapKind, NodeId } from "./types";

/**
 * Clicking a box lights up two groups: teal and orange. What they mean
 * depends on the map's kind, and that choice lives in one place,
 * `REACH_MEANINGS`:
 *
 *  - connections (an arrow reads "from needs to"): teal = what the box
 *    needs (arrows followed forward), orange = what breaks without it
 *    (followed backward);
 *  - tree (an arrow reads "from leads to to"): teal = every path back to
 *    the start (followed backward, through every parent), orange =
 *    everything that comes after it (followed forward);
 *  - steps: as a tree, in a process's words.
 *
 * Both walks visit each box once, so loops are safe, and the selected box
 * itself is never in either group, even when a loop leads back to it.
 */

export type Walk = "forward" | "backward";

export interface ReachMeaning {
  /** Which way the teal group walks; orange walks the other way. */
  readonly teal: Walk;
  /** The status line's words for each group's count. */
  readonly tealWords: (n: number) => string;
  /** `null`: this kind has no orange group (nothing ahead is lit). */
  readonly orangeWords: ((n: number) => string) | null;
  /** Whether boxes and arrows in neither group fade while a box is
      selected (`false`: they look as usual). */
  readonly fadesRest: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const REACH_MEANINGS: Readonly<Record<MapKind, ReachMeaning>> = {
  connections: {
    teal: "forward",
    tealWords: (n) => `Needs ${plural(n, "thing", "things")}`,
    orangeWords: (n) => `${plural(n, "thing breaks", "things break")} without it`,
    fadesRest: true,
  },
  tree: {
    teal: "backward",
    tealWords: (n) => `Comes from ${n}`,
    orangeWords: (n) => `Leads to ${n}`,
    fadesRest: true,
  },
  // Steps read like a tree: what came before, and what comes after.
  steps: {
    teal: "backward",
    tealWords: (n) => `Comes after ${plural(n, "step", "steps")}`,
    orangeWords: (n) => `${plural(n, "step follows", "steps follow")}`,
    fadesRest: true,
  },
  // A match lights only the path that led to it: nothing ahead, and the
  // other matches stay as they are (owner's calls, 2026-10-16).
  bracket: {
    teal: "backward",
    tealWords: (n) => `Fed by ${plural(n, "match", "matches")}`,
    orangeWords: null,
    fadesRest: false,
  },
};

export interface Reach {
  readonly selected: NodeId;
  /** Which way teal walked (from the map's kind). */
  readonly tealWalk: Walk;
  readonly teal: ReadonlySet<NodeId>;
  /** Every box in the orange group, including any also in teal (possible
      only inside a loop). */
  readonly orange: ReadonlySet<NodeId>;
  /** How boxes and arrows in neither group look: faded, or as usual. */
  readonly rest: "faded" | "plain";
}

/** How a box looks while another (or it) is selected. */
export type NodeHighlight = "selected" | "teal" | "orange" | "faded" | "plain";
/** How an arrow looks while a box is selected. */
export type LinkHighlight = "teal" | "orange" | "faded" | "plain";

/** Every box reachable from `start` by following arrows one way. */
export function walk(map: LinkMap, start: NodeId, direction: Walk): Set<NodeId> {
  const next = new Map<NodeId, NodeId[]>();
  for (const link of Object.values(map.links)) {
    const [a, b] = direction === "forward" ? [link.from, link.to] : [link.to, link.from];
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

const opposite = (w: Walk): Walk => (w === "forward" ? "backward" : "forward");

/** `null` when nothing is selected or the selected box no longer exists. */
export function reachOf(map: LinkMap, selected: NodeId | null): Reach | null {
  if (selected === null || !map.nodes[selected]) return null;
  const { teal: tealWalk, orangeWords, fadesRest } = REACH_MEANINGS[map.kind];
  return {
    selected,
    tealWalk,
    // A bracket follows its players' path back, not every feeding match.
    teal: map.kind === "bracket" ? pathTo(map, selected) : walk(map, selected, tealWalk),
    orange: orangeWords ? walk(map, selected, opposite(tealWalk)) : new Set(),
    rest: fadesRest ? "faded" : "plain",
  };
}

/**
 * A box in both groups (it sits in a loop with the selected one) shows as
 * teal, as in the prototype.
 */
export function nodeHighlight(reach: Reach, id: NodeId): NodeHighlight {
  if (id === reach.selected) return "selected";
  if (reach.teal.has(id)) return "teal";
  if (reach.orange.has(id)) return "orange";
  return reach.rest;
}

/** Whether an arrow lies on a path that a walk from `selected` followed. */
function onPath(link: Link, selected: NodeId, group: ReadonlySet<NodeId>, direction: Walk): boolean {
  const [near, far] = direction === "forward" ? [link.from, link.to] : [link.to, link.from];
  return (near === selected || group.has(near)) && group.has(far);
}

/** An arrow lights up when it lies on a path the highlight follows. */
export function linkHighlight(reach: Reach, link: Link): LinkHighlight {
  const { selected, tealWalk } = reach;
  if (onPath(link, selected, reach.teal, tealWalk)) return "teal";
  if (onPath(link, selected, reach.orange, opposite(tealWalk))) return "orange";
  return reach.rest;
}

/** The status line's two numbers. A box in both groups counts only once,
    under teal, matching how it is drawn. */
export function reachCounts(reach: Reach): { teal: number; orange: number } {
  let orange = 0;
  for (const id of reach.orange) if (!reach.teal.has(id)) orange++;
  return { teal: reach.teal.size, orange };
}
