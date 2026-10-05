import { createLinkId, createNodeId } from "./ids";
import { canLink, type LinkVerdict } from "./rules";
import type {
  ArrowLength,
  LayoutDirection,
  Link,
  LinkId,
  LinkMap,
  MapId,
  MapKind,
  MapNode,
  NodeId,
  PaletteColor,
  Point,
  Size,
} from "./types";
import { ARROW_LENGTH_PRESETS, ARROW_LENGTH_RANGE, DEFAULT_LINK_LABEL } from "./types";

/**
 * Edits to a map. Every function is pure: it takes a map and returns a new
 * one (or the same object when nothing changed, so the store can skip a
 * save and React can skip a render). Ids can be passed in, so tests and
 * undo can replay an edit exactly.
 */

export function createMap(id: MapId, name: string, page: Size, kind: MapKind = "connections"): LinkMap {
  return { id, name, kind, page, direction: "TB", arrowLength: ARROW_LENGTH_PRESETS.medium, nodes: {}, links: {} };
}

/** Tidies a typed name: runs of whitespace become one space, ends trimmed. */
export const cleanName = (text: string): string => text.replace(/\s+/g, " ").trim();

export function addNode(
  map: LinkMap,
  at: Point,
  name = "",
  id: NodeId = createNodeId(),
): { map: LinkMap; nodeId: NodeId } {
  const node: MapNode = { id, name: cleanName(name), x: at.x, y: at.y, color: null };
  return { map: { ...map, nodes: { ...map.nodes, [id]: node } }, nodeId: id };
}

function updateNode(map: LinkMap, id: NodeId, change: Partial<Omit<MapNode, "id">>): LinkMap {
  const node = map.nodes[id];
  if (!node) return map;
  const next = { ...node, ...change };
  if ((Object.keys(change) as (keyof typeof change)[]).every((k) => next[k] === node[k])) return map;
  return { ...map, nodes: { ...map.nodes, [id]: next } };
}

export const renameNode = (map: LinkMap, id: NodeId, name: string): LinkMap =>
  updateNode(map, id, { name: cleanName(name) });

export const moveNode = (map: LinkMap, id: NodeId, to: Point): LinkMap => updateNode(map, id, { x: to.x, y: to.y });

export const setNodeColor = (map: LinkMap, id: NodeId, color: PaletteColor | null): LinkMap =>
  updateNode(map, id, { color });

/** Moves many boxes at once (Tidy up); ids not on the map are ignored. */
export function moveNodes(map: LinkMap, positions: ReadonlyMap<NodeId, Point>): LinkMap {
  let next = map;
  for (const [id, at] of positions) next = moveNode(next, id, at);
  return next;
}

/** Deletes a box and every arrow touching it. */
export function deleteNode(map: LinkMap, id: NodeId): LinkMap {
  if (!map.nodes[id]) return map;
  const nodes = { ...map.nodes };
  delete nodes[id];
  const links: Record<LinkId, Link> = {};
  for (const link of Object.values(map.links)) {
    if (link.from !== id && link.to !== id) links[link.id] = link;
  }
  return { ...map, nodes, links };
}

/** Adds an arrow if the map's rules allow it; otherwise says why not. */
export function addLink(
  map: LinkMap,
  from: NodeId,
  to: NodeId,
  label = DEFAULT_LINK_LABEL,
  id: LinkId = createLinkId(),
): { map: LinkMap; linkId: LinkId } | { map: LinkMap; linkId: null; verdict: LinkVerdict } {
  const verdict = canLink(map, from, to);
  if (!verdict.ok) return { map, linkId: null, verdict };
  const link: Link = { id, from, to, label: cleanName(label) || DEFAULT_LINK_LABEL };
  return { map: { ...map, links: { ...map.links, [id]: link } }, linkId: id };
}

/** An emptied label goes back to "needs", as in the prototype. */
export function setLinkLabel(map: LinkMap, id: LinkId, label: string): LinkMap {
  const link = map.links[id];
  const next = cleanName(label) || DEFAULT_LINK_LABEL;
  if (!link || link.label === next) return map;
  return { ...map, links: { ...map.links, [id]: { ...link, label: next } } };
}

export function deleteLink(map: LinkMap, id: LinkId): LinkMap {
  if (!map.links[id]) return map;
  const links = { ...map.links };
  delete links[id];
  return { ...map, links };
}

export function renameMap(map: LinkMap, name: string): LinkMap {
  const next = cleanName(name);
  return next && next !== map.name ? { ...map, name: next } : map;
}

/** A copy of the whole map under a new id and name. Box and arrow ids stay
    the same: they only need to be unique within one map. */
export function duplicateMap(map: LinkMap, id: MapId, name: string): LinkMap {
  return { ...map, id, name: cleanName(name) || map.name };
}

export const setDirection = (map: LinkMap, direction: LayoutDirection): LinkMap =>
  direction === map.direction ? map : { ...map, direction };

/** An arrow length kept to whole pixels within the allowed range. */
export const clampArrowLength = (length: number): ArrowLength =>
  Math.min(ARROW_LENGTH_RANGE.max, Math.max(ARROW_LENGTH_RANGE.min, Math.round(length)));

export function setArrowLength(map: LinkMap, length: ArrowLength): LinkMap {
  const arrowLength = clampArrowLength(length);
  return arrowLength === map.arrowLength ? map : { ...map, arrowLength };
}

export function setPage(map: LinkMap, page: Size): LinkMap {
  return page.width === map.page.width && page.height === map.page.height ? map : { ...map, page };
}
