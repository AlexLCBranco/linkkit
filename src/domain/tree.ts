import { createLinkId, createNodeId } from "./ids";
import { addNode, createMap, deleteNodes } from "./map";
import { arrowsInto, canDeleteBox } from "./rules";
import { walk } from "./reach";
import type { Link, LinkId, LinkMap, MapId, NodeId, Point, Size } from "./types";
import { DEFAULT_LINK_LABELS } from "./types";

/**
 * Edits only a tree needs. Pure, like map.ts: each takes a map and returns
 * a new one.
 *
 * A tree always has exactly one start (the box with nothing leading into
 * it) and no loose boxes, so every edit here keeps that true in ONE step:
 * a new step arrives together with the arrow into it, and deleting a box
 * takes along every box that could only be reached through it.
 */

/** The name a new tree's start box has until one is typed. */
export const START_NAME = "Start";

/** A blank tree: just its start box (centred on 0, 0; Tidy up places it). */
export function createTree(
  id: MapId,
  name: string,
  page: Size,
  startName = START_NAME,
  startId: NodeId = createNodeId(),
): { map: LinkMap; startId: NodeId } {
  const { map } = addNode(createMap(id, name, page, "tree"), { x: 0, y: 0 }, startName, startId);
  return { map, startId };
}

/** The start: the (first) box with nothing leading into it, or `null` for
    an empty map. */
export function startOf(map: LinkMap): NodeId | null {
  for (const id of Object.keys(map.nodes) as NodeId[]) if (arrowsInto(map, id) === 0) return id;
  return null;
}

/**
 * Adds a next step after `from`: a new box at `at` and the arrow into it,
 * together, so the tree never has a loose box (not even for a moment, as a
 * separate "add box" then "connect" would). A brand-new box can't close a
 * loop or repeat an arrow, so this needs no `canLink`. `null` if `from` is
 * not on the map.
 */
export function addNextStep(
  map: LinkMap,
  from: NodeId,
  at: Point,
  name = "",
  id: NodeId = createNodeId(),
  linkId: LinkId = createLinkId(),
): { map: LinkMap; nodeId: NodeId } | null {
  if (!map.nodes[from]) return null;
  const added = addNode(map, at, name, id);
  const link: Link = { id: linkId, from, to: id, label: DEFAULT_LINK_LABELS[map.kind] };
  return { map: { ...added.map, links: { ...added.map.links, [linkId]: link } }, nodeId: id };
}

/**
 * Every box that deleting `id` would take with it: the box itself and each
 * box after it that could then no longer be reached from the start. A box
 * that another parent still leads to stays (and so does everything it
 * leads to). Empty when the box can't be deleted (the start).
 */
export const branchOf = (map: LinkMap, id: NodeId): Set<NodeId> => branchesOf(map, [id]);

/**
 * The same for several boxes deleted together (a marquee selection): the
 * ones that may go (never the start), and every box after them that no box
 * staying behind still leads to. Worked out for the group as a whole: a box
 * whose two parents are both deleted goes too, though either parent on its
 * own would leave it.
 */
export function branchesOf(map: LinkMap, ids: Iterable<NodeId>): Set<NodeId> {
  const gone = new Set([...ids].filter((id) => canDeleteBox(map, id)));
  if (gone.size === 0) return gone;
  // What is still reachable from the start(s) once those boxes are gone.
  const links = Object.values(map.links).filter((l) => !gone.has(l.from) && !gone.has(l.to));
  const without: LinkMap = { ...map, links: Object.fromEntries(links.map((l) => [l.id, l])) as LinkMap["links"] };
  const kept = new Set<NodeId>();
  for (const start of Object.keys(map.nodes) as NodeId[]) {
    if (gone.has(start) || arrowsInto(map, start) > 0) continue;
    kept.add(start);
    for (const n of walk(without, start, "forward")) kept.add(n);
  }
  const branch = new Set(gone);
  for (const id of gone) for (const n of walk(map, id, "forward")) if (!kept.has(n)) branch.add(n);
  return branch;
}

/** Deletes boxes and their branches (see `branchesOf`), with every arrow
    touching them. The same map when none of them can be deleted. */
export function deleteBranches(map: LinkMap, ids: Iterable<NodeId>): LinkMap {
  const branch = branchesOf(map, ids);
  return branch.size === 0 ? map : deleteNodes(map, branch);
}

/** Deletes a box and its branch (see `branchOf`). */
export const deleteBranch = (map: LinkMap, id: NodeId): LinkMap => deleteBranches(map, [id]);
