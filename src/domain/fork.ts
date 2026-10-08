import { createLinkId, createNodeId } from "./ids";
import { isUntitled, numberedName, UNTITLED_MAP } from "./names";
import { isOrdered, normalizeOrder } from "./order";
import { walk } from "./reach";
import { withFreshIds } from "./templates";
import type { Link, LinkId, LinkMap, MapId, MapNode, NodeId } from "./types";

/**
 * "Fork into a new map" (Treekit's fork a branch, as its own map): a box
 * and everything after it -- what it leads to in a tree, what it needs in
 * a connections map, folded and cut boxes included -- copied into a new
 * standalone map, so two versions can sit side by side. The original is
 * not touched. Pure: the store saves and opens the copy.
 *
 * The copy keeps the boxes' names, colours, statuses and notes, the
 * arrows between them with their labels, the sibling order, what is
 * folded, and the map's settings (direction, arrow length, hide cut). It
 * gets fresh ids, no trash, and is never linked to Boardkit (even when
 * the original is). In a tree the forked box becomes the start, keeping
 * its keep / maybe / cut (a start may have one, as in Treekit).
 *
 * Named after its first (start) box, so the name follows that box until
 * renamed by hand (`followBoxName`); a blank box gives the next free
 * "Untitled map N" (`taken`: the names already in use).
 */
export function forkBranch(
  map: LinkMap,
  from: NodeId,
  id: MapId,
  taken: Iterable<string>,
  newNode: () => NodeId = createNodeId,
  newLink: () => LinkId = createLinkId,
): LinkMap | null {
  const root = map.nodes[from];
  if (!root) return null;
  const branch = new Set<NodeId>([from, ...walk(map, from, "forward")]);
  // The forked box first: a connections map is named after its first box.
  const nodes: Record<NodeId, MapNode> = { [from]: root };
  for (const nodeId of branch) if (nodeId !== from) nodes[nodeId] = map.nodes[nodeId];
  const links: Record<LinkId, Link> = {};
  for (const link of Object.values(map.links)) if (branch.has(link.from) && branch.has(link.to)) links[link.id] = link;
  const name = root.name && !isUntitled(root.name) ? root.name : numberedName(UNTITLED_MAP, taken);
  const { linkedBoard: _, ...unlinked } = map;
  const copy: LinkMap = {
    ...unlinked,
    nodes,
    links,
    // The sibling order the original had, for the boxes that came along.
    order: isOrdered(map) ? keptOrder(map, branch) : {},
    collapsed: map.collapsed.filter((c) => branch.has(c)),
    trash: [],
  };
  const ordered = isOrdered(copy) ? { ...copy, order: normalizeOrder(copy) } : copy;
  return withFreshIds(ordered, id, name, newNode, newLink);
}

function keptOrder(map: LinkMap, branch: ReadonlySet<NodeId>): LinkMap["order"] {
  const order: Record<NodeId, readonly NodeId[]> = {};
  for (const [parent, kids] of Object.entries(map.order) as [NodeId, readonly NodeId[]][]) {
    if (branch.has(parent)) order[parent] = kids.filter((k) => branch.has(k));
  }
  return order;
}
