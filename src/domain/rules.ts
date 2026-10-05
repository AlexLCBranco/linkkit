import type { LinkMap, MapKind, NodeId } from "./types";

/**
 * "May this arrow be drawn?" -- answered here and only here. The UI asks
 * `canLink` while dragging (to show a box as a valid drop target) and the
 * map edit asks again before adding, so the rule can never drift between
 * the two. A future tree mode is one more entry in `RULES` (for example
 * "at most one parent, no loops"), not edits spread through the UI.
 */

export type LinkRefusal =
  /** One of the boxes does not exist (deleted mid-drag). */
  | "missing"
  /** A box cannot need itself. */
  | "self"
  /** This exact arrow (same direction) is already there. */
  | "duplicate";

export type LinkVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: LinkRefusal };

type LinkRule = (map: LinkMap, from: NodeId, to: NodeId) => LinkVerdict;

const OK: LinkVerdict = { ok: true };
const refuse = (reason: LinkRefusal): LinkVerdict => ({ ok: false, reason });

/**
 * Connections: anything may need anything else. Loops are allowed (real
 * dependencies do loop), and so is the reverse arrow of an existing one;
 * only an exact repeat is refused.
 */
const connections: LinkRule = (map, from, to) => {
  if (!map.nodes[from] || !map.nodes[to]) return refuse("missing");
  if (from === to) return refuse("self");
  for (const link of Object.values(map.links)) {
    if (link.from === from && link.to === to) return refuse("duplicate");
  }
  return OK;
};

const RULES: Record<MapKind, LinkRule> = { connections };

export function canLink(map: LinkMap, from: NodeId, to: NodeId): LinkVerdict {
  return RULES[map.kind](map, from, to);
}
