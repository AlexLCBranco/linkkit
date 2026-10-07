import { arrowsInto } from "./rules";
import type { Link, LinkId, LinkMap, MapNode, NodeId } from "./types";

/**
 * Keep / maybe / cut, worked out (Treekit's, widened for two parents). Only
 * a box's own status is stored; whether it LOOKS cut is computed here, the
 * one definition both Linkkit and (later) Boardkit's badge use:
 *
 *   A box looks cut when it is cut itself, or when every way into it comes
 *   from a box that looks cut.
 *
 * So a box with two parents stays alive while one way in is. The start has
 * no way in and can't be cut, so it never looks cut (a status saved on it
 * by mistake is ignored).
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
  const parents = new Map<NodeId, NodeId[]>();
  const children = new Map<NodeId, NodeId[]>();
  for (const { from, to } of Object.values(map.links)) {
    if (!map.nodes[from] || !map.nodes[to]) continue;
    parents.set(to, [...(parents.get(to) ?? []), from]);
    children.set(from, [...(children.get(from) ?? []), to]);
  }
  // In order, parents before children (Kahn's), so each box is judged once
  // all its ways in are. A box on a loop (only in a damaged tree) is never
  // reached that way and counts only its own status.
  const waiting = new Map<NodeId, number>();
  const ready: NodeId[] = [];
  for (const id of Object.keys(map.nodes) as NodeId[]) {
    const n = parents.get(id)?.length ?? 0;
    waiting.set(id, n);
    if (n === 0) ready.push(id);
  }
  const judged = new Set<NodeId>();
  for (let i = 0; i < ready.length; i++) {
    const id = ready[i];
    judged.add(id);
    const ins = parents.get(id) ?? [];
    if (ins.length > 0 && (map.nodes[id].status === "cut" || ins.every((p) => cut.has(p)))) cut.add(id);
    for (const c of children.get(id) ?? []) {
      const left = waiting.get(c)! - 1;
      waiting.set(c, left);
      if (left === 0) ready.push(c);
    }
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

let shownCache: { map: LinkMap; shown: LinkMap } | null = null;

/**
 * The map as it shows: with "hide cut" on, without the boxes that look cut
 * and every arrow touching them. What the page draws, Tidy up lays out and
 * the highlight walks. The same object when nothing is hidden, and the same
 * result for the same map, so it can be read freely while rendering.
 */
export function shownMap(map: LinkMap): LinkMap {
  if (!map.hideCut || map.kind !== "tree") return map;
  if (shownCache?.map === map) return shownCache.shown;
  const cut = looksCut(map);
  let shown = map;
  if (cut.size > 0) {
    const nodes = Object.fromEntries(Object.values(map.nodes).filter((n) => !cut.has(n.id)).map((n) => [n.id, n]));
    const links = Object.fromEntries(
      Object.values(map.links)
        .filter((l) => !cut.has(l.from) && !cut.has(l.to))
        .map((l) => [l.id, l]),
    );
    shown = {
      ...map,
      nodes: nodes as Record<NodeId, MapNode>,
      links: links as Record<LinkId, Link>,
    };
  }
  shownCache = { map, shown };
  return shown;
}
