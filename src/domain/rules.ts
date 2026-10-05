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
 *
 * A new kind is one more entry in `RULES`, not edits spread through the UI.
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
  | "loop";

export type LinkVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: LinkRefusal };

interface KindRules {
  readonly canLink: (map: LinkMap, from: NodeId, to: NodeId) => LinkVerdict;
  readonly canDeleteBox: (map: LinkMap, id: NodeId) => boolean;
  readonly canDeleteLink: (map: LinkMap, id: LinkId) => boolean;
}

const OK: LinkVerdict = { ok: true };
const refuse = (reason: LinkRefusal): LinkVerdict => ({ ok: false, reason });

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
};

const RULES: Record<MapKind, KindRules> = { connections, tree };

export function canLink(map: LinkMap, from: NodeId, to: NodeId): LinkVerdict {
  return RULES[map.kind].canLink(map, from, to);
}

export const canDeleteBox = (map: LinkMap, id: NodeId): boolean => RULES[map.kind].canDeleteBox(map, id);

export const canDeleteLink = (map: LinkMap, id: LinkId): boolean => RULES[map.kind].canDeleteLink(map, id);
