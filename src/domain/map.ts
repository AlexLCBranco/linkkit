import { createLinkId, createNodeId } from "./ids";
import { canCollapse, canLink, canMove, canSetStatus, linkRefusalText, moveRefusalText, type LinkVerdict } from "./rules";
import { isOrdered, withNextStep, withoutBoxes, withoutNextStep } from "./order";
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
  NodeStatus,
  PaletteColor,
  Point,
  Size,
} from "./types";
import { ARROW_LENGTH_PRESETS, ARROW_LENGTH_RANGE, DEFAULT_LINK_LABELS } from "./types";

/**
 * Edits to a map. Every function is pure: it takes a map and returns a new
 * one (or the same object when nothing changed, so the store can skip a
 * save and React can skip a render). Ids can be passed in, so tests and
 * undo can replay an edit exactly.
 */

export function createMap(id: MapId, name: string, page: Size, kind: MapKind = "connections"): LinkMap {
  return {
    id,
    name,
    kind,
    page,
    direction: "TB",
    arrowLength: ARROW_LENGTH_PRESETS.medium,
    nodes: {},
    links: {},
    order: {},
    hideCut: false,
    collapsed: [],
    trash: [],
  };
}

/** Tidies a typed name: runs of whitespace become one space, ends trimmed. */
export const cleanName = (text: string): string => text.replace(/\s+/g, " ").trim();

export function addNode(
  map: LinkMap,
  at: Point,
  name = "",
  id: NodeId = createNodeId(),
): { map: LinkMap; nodeId: NodeId } {
  const node: MapNode = { id, name: cleanName(name), x: at.x, y: at.y, color: null, status: null };
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

/** `node` with `notes`; an empty text takes the field away (absent = no
    notes, see `MapNode.notes`). */
export function withNotes(node: MapNode, notes: string): MapNode {
  if (notes) return { ...node, notes };
  const { notes: _, ...rest } = node;
  return rest;
}

/** Replaces a box's notes, kept exactly as typed (line breaks and all,
    so the panel can show what is being typed); emptied, the field goes.
    Notes that are only whitespace are dropped when read back (see
    `readMap`). The same map when nothing changes. */
export function setNodeNotes(map: LinkMap, id: NodeId, notes: string): LinkMap {
  const node = map.nodes[id];
  if (!node || (node.notes ?? "") === notes) return map;
  return { ...map, nodes: { ...map.nodes, [id]: withNotes(node, notes) } };
}

/** How a note clash is settled: the box's note as it is (in a linked map,
    Boardkit's pregame thots), the text kept aside (Linkkit's), or both. */
export type ClashPick = "note" | "aside" | "both";

/** Settles box `id`'s note clash (`LinkMap.noteClashes`). "both" joins the
    two, the note first, with a blank line between. The same map when the
    box has no clash. */
export function resolveNoteClash(map: LinkMap, id: NodeId, pick: ClashPick): LinkMap {
  const aside = map.noteClashes?.[id];
  const node = map.nodes[id];
  if (aside === undefined || !node) return map;
  const note = node.notes ?? "";
  const text = pick === "note" ? note : pick === "aside" ? aside : `${note.replace(/s+$/, "")}

${aside}`;
  const { [id]: _, ...rest } = map.noteClashes!;
  const { noteClashes: _all, ...without } = setNodeNotes(map, id, text);
  return Object.keys(rest).length ? { ...without, noteClashes: rest } : without;
}

/** Moves many boxes at once (Tidy up); ids not on the map are ignored. */
export function moveNodes(map: LinkMap, positions: ReadonlyMap<NodeId, Point>): LinkMap {
  let next = map;
  for (const [id, at] of positions) next = moveNode(next, id, at);
  return next;
}

/** Deletes a box and every arrow touching it. */
export const deleteNode = (map: LinkMap, id: NodeId): LinkMap => deleteNodes(map, [id]);

/** Adds an arrow if the map's rules allow it; otherwise says why not. */
export function addLink(
  map: LinkMap,
  from: NodeId,
  to: NodeId,
  label = DEFAULT_LINK_LABELS[map.kind],
  id: LinkId = createLinkId(),
): { map: LinkMap; linkId: LinkId } | { map: LinkMap; linkId: null; verdict: LinkVerdict } {
  const verdict = canLink(map, from, to);
  if (!verdict.ok) return { map, linkId: null, verdict };
  const link: Link = { id, from, to, label: cleanName(label) || DEFAULT_LINK_LABELS[map.kind] };
  const order = isOrdered(map) ? withNextStep(map.order, from, to) : map.order;
  return { map: { ...map, links: { ...map.links, [id]: link }, order }, linkId: id };
}

/** An emptied label goes back to the kind's default: "needs" (as in the
    prototype), or no label in a tree. */
export function setLinkLabel(map: LinkMap, id: LinkId, label: string): LinkMap {
  const link = map.links[id];
  const next = cleanName(label) || DEFAULT_LINK_LABELS[map.kind];
  if (!link || link.label === next) return map;
  return { ...map, links: { ...map.links, [id]: { ...link, label: next } } };
}

export function deleteLink(map: LinkMap, id: LinkId): LinkMap {
  const link = map.links[id];
  if (!link) return map;
  const links = { ...map.links };
  delete links[id];
  return { ...map, links, order: withoutNextStep(map.order, link.from, link.to) };
}

export function renameMap(map: LinkMap, name: string): LinkMap {
  const next = cleanName(name);
  return next && next !== map.name ? { ...map, name: next } : map;
}

/** A copy of the whole map under a new id and name. Box and arrow ids stay
    the same: they only need to be unique within one map. */
export function duplicateMap(map: LinkMap, id: MapId, name: string): LinkMap {
  // The copy starts with an empty trash: what was deleted stays with the
  // original. It is never linked: a board is shared with one map only.
  const { linkedBoard: _, ...unlinked } = map;
  return { ...unlinked, id, name: cleanName(name) || map.name, trash: [] };
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

/* ---- Several boxes at once (a marquee selection) ---- */

/** Deletes boxes and every arrow touching any of them. */
export function deleteNodes(map: LinkMap, ids: Iterable<NodeId>): LinkMap {
  const gone = new Set([...ids].filter((id) => map.nodes[id]));
  if (gone.size === 0) return map;
  const nodes = { ...map.nodes };
  for (const id of gone) delete nodes[id];
  const links: Record<LinkId, Link> = {};
  for (const link of Object.values(map.links)) {
    if (!gone.has(link.from) && !gone.has(link.to)) links[link.id] = link;
  }
  const collapsed = map.collapsed.some((id) => gone.has(id)) ? map.collapsed.filter((id) => !gone.has(id)) : map.collapsed;
  return { ...map, nodes, links, order: withoutBoxes(map.order, gone), collapsed };
}

export function setNodesColor(map: LinkMap, ids: Iterable<NodeId>, color: PaletteColor | null): LinkMap {
  let next = map;
  for (const id of ids) next = setNodeColor(next, id, color);
  return next;
}

/** Copied boxes, with the arrows that run between them (an arrow to a box
    left behind isn't copied: it would have nowhere to point). */
export interface MapFragment {
  readonly nodes: readonly MapNode[];
  readonly links: readonly Link[];
}

export function copyFragment(map: LinkMap, ids: Iterable<NodeId>): MapFragment {
  const picked = new Set([...ids].filter((id) => map.nodes[id]));
  return {
    nodes: [...picked].map((id) => map.nodes[id]),
    links: Object.values(map.links).filter((l) => picked.has(l.from) && picked.has(l.to)),
  };
}

/** Where a fragment's boxes sit, as one point: the middle of their centres. */
export function fragmentCenter(fragment: MapFragment): Point {
  const xs = fragment.nodes.map((n) => n.x);
  const ys = fragment.nodes.map((n) => n.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * Pastes a fragment, moved by `offset`, with new ids so it never clashes
 * with what is there (pasting twice makes two copies). Returns the new
 * boxes' ids in the fragment's order. Callers check `canPaste` first: the
 * arrows are copied as they are, not re-checked one by one.
 */
export function pasteFragment(
  map: LinkMap,
  fragment: MapFragment,
  offset: Point,
  newNodeId: () => NodeId = createNodeId,
  newLinkId: () => LinkId = createLinkId,
): { map: LinkMap; nodeIds: NodeId[] } {
  const idOf = new Map<NodeId, NodeId>();
  const nodes = { ...map.nodes };
  for (const node of fragment.nodes) {
    const id = newNodeId();
    idOf.set(node.id, id);
    nodes[id] = { ...node, id, x: node.x + offset.x, y: node.y + offset.y };
  }
  const links = { ...map.links };
  for (const link of fragment.links) {
    const from = idOf.get(link.from);
    const to = idOf.get(link.to);
    if (!from || !to) continue;
    const id = newLinkId();
    links[id] = { ...link, id, from, to };
  }
  return { map: { ...map, nodes, links }, nodeIds: [...idOf.values()] };
}

/* ---- Keep / maybe / cut (trees) ---- */

/** Sets the status of every box that may have one (`canSetStatus`);
    `null` clears it. The same map when nothing changes. */
export function setNodesStatus(map: LinkMap, ids: Iterable<NodeId>, status: NodeStatus | null): LinkMap {
  let next = map;
  for (const id of ids) if (canSetStatus(map, id)) next = updateNode(next, id, { status });
  return next;
}

export const setHideCut = (map: LinkMap, hideCut: boolean): LinkMap =>
  hideCut === map.hideCut ? map : { ...map, hideCut };

/* ---- Collapse (trees) ---- */

/** Collapses (`on`) or expands boxes. Only boxes that may be collapsed
    (`canCollapse`) are added; any box may be expanded. The same map when
    nothing changes. */
export function setCollapsed(map: LinkMap, ids: Iterable<NodeId>, on: boolean): LinkMap {
  const now = new Set(map.collapsed);
  for (const id of ids) {
    if (on && canCollapse(map, id)) now.add(id);
    else if (!on) now.delete(id);
  }
  if (now.size === map.collapsed.length && map.collapsed.every((id) => now.has(id))) return map;
  return { ...map, collapsed: [...now] };
}

/**
 * Moves one end of an arrow onto another box (a connections map: drag an
 * arrow's end to reconnect it). The arrow keeps its id and label. Refused,
 * saying why, when the rules don't allow the arrow it would become (asked
 * without the arrow itself, so moving an end back to where it was, or
 * swapping nothing, is not "already there"). In a tree an arrow's end
 * moves its box instead (`moveToParent` in tree.ts).
 */
export function reconnectLink(
  map: LinkMap,
  id: LinkId,
  end: "from" | "to",
  box: NodeId,
): { map: LinkMap; verdict: LinkVerdict } {
  const link = map.links[id];
  if (!link) return { map, verdict: { ok: false, reason: "missing" } };
  if (link[end] === box) return { map, verdict: { ok: true } };
  const from = end === "from" ? box : link.from;
  const to = end === "to" ? box : link.to;
  const without = deleteLink(map, id);
  const verdict = canLink(without, from, to);
  if (!verdict.ok) return { map, verdict };
  const order = isOrdered(map) ? withNextStep(without.order, from, to) : map.order;
  return { map: { ...without, links: { ...without.links, [id]: { ...link, from, to } }, order }, verdict };
}

export type RelinkCheck =
  /** Letting go there changes nothing (the end is already on that box). */
  | { readonly kind: "same" }
  | { readonly kind: "ok" }
  | { readonly kind: "refused"; readonly text: string };

/**
 * What letting go of arrow `id`'s `end` on `box` would do: the drag's
 * preview (a ring, or a not-allowed chip before letting go) and the store
 * ask the same question. A connections map moves that end. In a tree
 * either end means one thing: the box the arrow leads to goes under `box`
 * (`canMove`), or, for one of several ways in, just this arrow starts
 * from `box` (`canLink`).
 */
export function relinkCheck(map: LinkMap, id: LinkId, end: "from" | "to", box: NodeId): RelinkCheck {
  const link = map.links[id];
  if (!link || !map.nodes[box]) return { kind: "refused", text: "That box is gone." };
  if (map.kind !== "tree") {
    if (link[end] === box) return { kind: "same" };
    const done = reconnectLink(map, id, end, box);
    if (done.verdict.ok) return { kind: "ok" };
    const from = end === "from" ? box : link.from;
    const to = end === "to" ? box : link.to;
    return { kind: "refused", text: linkRefusalText(map, from, to, done.verdict.reason) };
  }
  const child = link.to;
  if (box === link.from) return { kind: "same" };
  const into = Object.values(map.links).filter((l) => l.to === child).length;
  if (into > 1) {
    const done = reconnectLink(map, id, "from", box);
    return done.verdict.ok
      ? { kind: "ok" }
      : { kind: "refused", text: linkRefusalText(map, box, child, done.verdict.reason) };
  }
  const verdict = canMove(map, child, box);
  return verdict.ok ? { kind: "ok" } : { kind: "refused", text: moveRefusalText(map, child, box, verdict.reason) };
}
