import { createLinkId, createNodeId } from "./ids";
import { loopBreakingLinks } from "./layout";
import { addNode, createMap, deleteNodes } from "./map";
import { nextSteps, normalizeOrder, withNextStep, withoutNextStep } from "./order";
import { arrowsInto, canCollapse, canDeleteBox } from "./rules";
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

/** A blank tree: just its start box (centred on 0, 0; Tidy up places it),
    drawn as Treekit draws trees (elbow lines, Treekit's text), the
    owner's choice for new trees. Maps made before keep their styles. */
export function createTree(
  id: MapId,
  name: string,
  page: Size,
  startName = START_NAME,
  startId: NodeId = createNodeId(),
): { map: LinkMap; startId: NodeId } {
  const blank: LinkMap = { ...createMap(id, name, page, "tree"), arrowStyle: "elbow", labelStyle: "treekit" };
  const { map } = addNode(blank, { x: 0, y: 0 }, startName, startId);
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
  const order = withNextStep(added.map.order, from, id);
  return { map: { ...added.map, links: { ...added.map.links, [linkId]: link }, order }, nodeId: id };
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

/**
 * Makes `id` (with its branch) a next step of `parent`, just before
 * `before` among `parent`'s next steps (`null`, or a box that isn't one of
 * them: last). The arrow into `id` keeps its id and label and only gets a
 * new start (decided: a moved card keeps "if yes"); under the same parent
 * this is a reorder. Boxes keep their places: the canvas re-tidies.
 *
 * Ask `canMove` first: this only refuses (returning the same map) what it
 * can't do at all -- a box with no way in, or with two and `parent`
 * neither. Also the same map when nothing would change.
 */
export function moveToParent(map: LinkMap, id: NodeId, parent: NodeId, before: NodeId | null): LinkMap {
  if (!map.nodes[id] || !map.nodes[parent] || id === parent) return map;
  const into = Object.values(map.links).filter((l) => l.to === id);
  const link = into.find((l) => l.from === parent) ?? (into.length === 1 ? into[0] : undefined);
  if (!link) return map;
  const links = link.from === parent ? map.links : { ...map.links, [link.id]: { ...link, from: parent } };
  const siblings = nextSteps({ ...map, links }, parent).filter((c) => c !== id);
  const at = before === null ? -1 : siblings.indexOf(before);
  siblings.splice(at === -1 ? siblings.length : at, 0, id);
  if (links === map.links && nextSteps(map, parent).join() === siblings.join()) return map;
  const order = { ...withoutNextStep(map.order, link.from, id), [parent]: siblings };
  return { ...map, links, order };
}

/**
 * Puts a damaged tree back into a tree's shape (one start, no loose boxes,
 * no loops), for saved data a bug, a hand edit or an old version broke. No
 * box is ever deleted; only arrows are dropped or added, in this order:
 *
 *  1. The start is the oldest box with nothing leading into it (or, when
 *     every box has a way in -- a tree that is all loop -- the oldest box).
 *  2. Arrows into the start are dropped.
 *  3. Each loop loses the arrow that closes it: the one Tidy up already
 *     sets aside (`loopBreakingLinks`). Its label goes with it.
 *  4. Every other box with no way in (a second start with its branch, or a
 *     lone box) becomes the start's last next step.
 *
 * Boxes keep their places (no tidy). Collapse is cleaned against the new
 * arrows: a box left with no next steps can't be folded (part of the
 * repair, not a fix of its own: a whole tree can have a folded box whose
 * last next step was later deleted). `fixes` counts each arrow dropped or
 * added; 0 means the map came back unchanged. Connections maps are
 * returned as they are.
 */
export function repairTree(
  map: LinkMap,
  newLinkId: () => LinkId = createLinkId,
): { map: LinkMap; fixes: number } {
  const boxes = Object.keys(map.nodes) as NodeId[];
  if (map.kind !== "tree" || boxes.length === 0) return { map, fixes: 0 };
  let fixes = 0;
  const hasWayIn = (m: LinkMap, id: NodeId) => Object.values(m.links).some((l) => l.to === id);

  // 1 and 2.
  const start = boxes.find((b) => !hasWayIn(map, b)) ?? boxes[0];
  let links = Object.values(map.links).filter((l) => l.to !== start);
  fixes += Object.keys(map.links).length - links.length;
  let repaired: LinkMap = { ...map, links: Object.fromEntries(links.map((l) => [l.id, l])) as LinkMap["links"] };

  // 3.
  const loops = loopBreakingLinks(repaired);
  if (loops.size > 0) {
    links = links.filter((l) => !loops.has(l.id));
    fixes += loops.size;
    repaired = { ...repaired, links: Object.fromEntries(links.map((l) => [l.id, l])) as LinkMap["links"] };
  }

  // 4.
  // The next steps already there keep their order (placed by position when
  // none is stored), so attached boxes really come last.
  let order = normalizeOrder(repaired, repaired.direction);
  const added: Record<LinkId, Link> = {};
  for (const box of boxes) {
    if (box === start || hasWayIn(repaired, box)) continue;
    const id = newLinkId();
    added[id] = { id, from: start, to: box, label: DEFAULT_LINK_LABELS.tree };
    order = withNextStep(order, start, box);
    fixes++;
  }
  if (fixes === 0) return { map, fixes: 0 };
  repaired = { ...repaired, links: { ...repaired.links, ...added }, order };
  const collapsed = repaired.collapsed.filter((c) => canCollapse(repaired, c));
  return { map: { ...repaired, collapsed }, fixes };
}
