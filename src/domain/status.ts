import { arrowsInto } from "./rules";
import { parentsFirst } from "./graph";
import type { LinkMap, NodeId } from "./types";

/**
 * Keep / maybe / cut, worked out (Treekit's, widened for two parents). Only
 * a box's own status is stored; whether it LOOKS cut is computed here, the
 * one definition both Linkkit and (later) Boardkit's badge use:
 *
 *   A box looks cut when it is cut itself, or when every way into it comes
 *   from a box that looks cut.
 *
 * So a box with two parents stays alive while one way in is. The start may
 * be cut too (Treekit's root can): then the whole tree looks cut.
 */

let cached: { map: LinkMap; cut: ReadonlySet<NodeId> } | null = null;

/** Every box that looks cut. Worked out once per map and reused (every box
    asks after each change). */
export function looksCut(map: LinkMap): ReadonlySet<NodeId> {
  if (cached?.map !== map) cached = { map, cut: computeLooksCut(map) };
  return cached.cut;
}

function computeLooksCut(map: LinkMap): Set<NodeId> {
  const cut = new Set<NodeId>();
  if (map.kind !== "tree") return cut;
  // Parents before children, so each box is judged once all its ways in
  // are. A box on a loop (only in a damaged tree) counts only its own
  // status.
  const { order, parents } = parentsFirst(map);
  const judged = new Set(order);
  for (const id of order) {
    const ins = parents.get(id) ?? [];
    if (map.nodes[id].status === "cut" || (ins.length > 0 && ins.every((p) => cut.has(p)))) cut.add(id);
  }
  for (const id of Object.keys(map.nodes) as NodeId[]) {
    if (!judged.has(id) && arrowsInto(map, id) > 0 && map.nodes[id].status === "cut") cut.add(id);
  }
  return cut;
}

/** How many boxes are cut themselves (each one a cut branch): the "Hide
    cut" button's count. */
export function cutCount(map: LinkMap): number {
  const cut = looksCut(map);
  let n = 0;
  for (const node of Object.values(map.nodes)) if (node.status === "cut" && cut.has(node.id)) n++;
  return n;
}
