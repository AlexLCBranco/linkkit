import { createLinkId } from "./ids";
import { deleteNodes } from "./map";
import { isOrdered, nextSteps, normalizeOrder } from "./order";
import { basicLinkCheck } from "./rules";
import { repairTree } from "./tree";
import type { Link, LinkId, LinkMap, MapId, MapNode, NodeId, SiblingOrder, TrashEntry, TrashPlace } from "./types";

/**
 * The trash: where deleted boxes and maps wait until they are restored or
 * erased, so nothing is erased by accident (Boardkit's rule). Pure, like
 * Boardkit's `trash.ts`: the store decides when, this decides what.
 *
 * Two parts:
 *  - Deleted boxes live in their own map (`map.trash`), so they are saved,
 *    exported and undone with it. One delete is one entry: the boxes, every
 *    arrow that touched them, and (trees) where each sat among its parent's
 *    next steps.
 *  - Deleted maps are a list of their own (`TrashedMap`); the map's saved
 *    record stays where it was until it is erased.
 *
 * Both are capped, and a delete that would push the oldest thing out is
 * asked about first (`trashOverflow`, `mapTrashOverflow`): the trash never
 * forgets anything silently.
 */

/** How many deleted boxes one map's trash holds (Boardkit's card limit). */
export const TRASH_LIMIT = 200;

/** How many deleted maps the trash holds (Boardkit's list limit). */
export const MAP_TRASH_LIMIT = 30;

/** An entry is known by its first box: a box is in at most one entry, and
    never on the map at the same time. */
export const trashEntryId = (entry: TrashEntry): NodeId => entry.nodes[0].id;

const boxCount = (trash: readonly TrashEntry[]): number => trash.reduce((n, e) => n + e.nodes.length, 0);

/** The entries a new delete of `adding` boxes pushes out, oldest first.
    The newest delete always stays, even one bigger than the limit. */
function evicted(trash: readonly TrashEntry[], adding: number): TrashEntry[] {
  const out: TrashEntry[] = [];
  let total = boxCount(trash) + adding;
  for (const entry of trash) {
    if (total <= TRASH_LIMIT) break;
    out.push(entry);
    total -= entry.nodes.length;
  }
  return out;
}

/** What deleting `count` more boxes would erase for good: empty when the
    trash has room. Asked before `trashBoxes`, so the user can be warned. */
export const trashOverflow = (map: LinkMap, count: number): TrashEntry[] => evicted(map.trash, count);

/** Where each of the `gone` boxes sits among its parents' next steps. */
function placesOf(map: LinkMap, gone: ReadonlySet<NodeId>): TrashPlace[] {
  if (!isOrdered(map)) return [];
  const places: TrashPlace[] = [];
  const parents = new Set(Object.values(map.links).filter((l) => gone.has(l.to)).map((l) => l.from));
  for (const parent of parents) {
    nextSteps(map, parent).forEach((child, index) => {
      if (gone.has(child)) places.push({ parent, child, index });
    });
  }
  return places;
}

/**
 * Deletes boxes and every arrow touching them, keeping them in the trash
 * as one entry. When that overfills the trash, the oldest entries go for
 * good: only call this once the user has been warned (`trashOverflow`).
 */
export function trashBoxes(map: LinkMap, ids: Iterable<NodeId>, deletedAt: number): LinkMap {
  const gone = new Set([...ids].filter((id) => map.nodes[id]));
  if (gone.size === 0) return map;
  const entry: TrashEntry = {
    deletedAt,
    nodes: [...gone].map((id) => map.nodes[id]),
    links: Object.values(map.links).filter((l) => gone.has(l.from) || gone.has(l.to)),
    places: placesOf(map, gone),
  };
  const out = new Set(evicted(map.trash, gone.size));
  return { ...deleteNodes(map, gone), trash: [...map.trash.filter((e) => !out.has(e)), entry] };
}

/** `order` with `child` among `parent`'s next steps at `index` (or last,
    when the list is shorter now). */
function placed(order: SiblingOrder, { parent, child, index }: TrashPlace): SiblingOrder {
  const list = (order[parent] ?? []).filter((c) => c !== child);
  return { ...order, [parent]: [...list.slice(0, index), child, ...list.slice(index)] };
}

/**
 * Puts a trash entry back: its boxes where they were, with every arrow to
 * a box still on the map. In a tree they rejoin their parents in their old
 * places, a parent folded away opens so they show, and a branch whose
 * parent is gone becomes a next step of the start (the same repair a
 * damaged tree gets, `repairTree`). The same map when there is no such
 * entry.
 */
export function restoreFromTrash(
  map: LinkMap,
  id: NodeId,
  newLinkId: () => LinkId = createLinkId,
): LinkMap {
  const entry = map.trash.find((e) => trashEntryId(e) === id);
  if (!entry) return map;
  const nodes: Record<NodeId, MapNode> = { ...map.nodes };
  for (const node of entry.nodes) if (!nodes[node.id]) nodes[node.id] = node;
  let next: LinkMap = { ...map, nodes, trash: map.trash.filter((e) => e !== entry) };

  // Each arrow checked against the arrows put back so far, so a repeat of
  // one drawn since is left out. A tree's own shape is checked as a whole
  // afterwards: one arrow at a time, every box put back looks like a start.
  for (const link of entry.links) {
    if (!basicLinkCheck(next, link.from, link.to).ok) continue;
    const linkId = next.links[link.id] ? newLinkId() : link.id;
    const restored: Link = { ...link, id: linkId };
    next = { ...next, links: { ...next.links, [linkId]: restored } };
  }
  if (!isOrdered(next)) return next;

  let order = next.order;
  const has = (p: TrashPlace) => Object.values(next.links).some((l) => l.from === p.parent && l.to === p.child);
  for (const place of [...entry.places].sort((a, b) => a.index - b.index)) if (has(place)) order = placed(order, place);
  const back = new Set(entry.nodes.map((n) => n.id));
  const parents = new Set(Object.values(next.links).filter((l) => back.has(l.to)).map((l) => l.from));
  const collapsed = next.collapsed.some((c) => parents.has(c)) ? next.collapsed.filter((c) => !parents.has(c)) : next.collapsed;
  next = repairTree({ ...next, order, collapsed }, newLinkId).map;
  return { ...next, order: normalizeOrder(next) };
}

/** Erases one trash entry for good. */
export function forgetTrashEntry(map: LinkMap, id: NodeId): LinkMap {
  const trash = map.trash.filter((e) => trashEntryId(e) !== id);
  return trash.length === map.trash.length ? map : { ...map, trash };
}

/** Erases every trash entry for good. */
export const emptyTrash = (map: LinkMap): LinkMap => (map.trash.length === 0 ? map : { ...map, trash: [] });

/** What a row in the trash, or the "trash is full" warning, says about
    some entries: the first box's name, how many boxes in all, and when the
    oldest went. */
export interface TrashSummary {
  readonly name: string;
  readonly boxes: number;
  readonly deletedAt: number;
}

export function summarize(entries: readonly TrashEntry[]): TrashSummary | null {
  if (entries.length === 0) return null;
  return { name: entries[0].nodes[0].name, boxes: boxCount(entries), deletedAt: entries[0].deletedAt };
}

/* ---- Deleted maps ---- */

/** A deleted map: enough to list it without reading it. */
export interface TrashedMap {
  readonly id: MapId;
  readonly name: string;
  readonly boxes: number;
  readonly deletedAt: number;
}

export type MapTrash = readonly TrashedMap[];

export const MAP_TRASH_VERSION = 1;

/** The oldest deleted map, which one more map delete would erase for good,
    or `null` while there is room. */
export const mapTrashOverflow = (trash: MapTrash): TrashedMap | null =>
  trash.length >= MAP_TRASH_LIMIT ? trash[0] : null;

/** Adds a deleted map; returns the new list and the maps pushed out (to be
    erased for good: only after the user was warned). */
export function withTrashedMap(trash: MapTrash, map: TrashedMap): { trash: MapTrash; erased: TrashedMap[] } {
  const all = [...trash.filter((m) => m.id !== map.id), map];
  const erased = all.slice(0, Math.max(0, all.length - MAP_TRASH_LIMIT));
  return { trash: all.slice(erased.length), erased };
}

export const withoutTrashedMap = (trash: MapTrash, id: MapId): MapTrash =>
  trash.some((m) => m.id === id) ? trash.filter((m) => m.id !== id) : trash;

export function serializeMapTrash(trash: MapTrash): { version: typeof MAP_TRASH_VERSION; maps: MapTrash } {
  return { version: MAP_TRASH_VERSION, maps: trash.map(({ id, name, boxes, deletedAt }) => ({ id, name, boxes, deletedAt })) };
}

/** The saved list of deleted maps; bad entries are skipped, and anything
    that isn't such a list reads as empty. */
export function readMapTrash(data: unknown): MapTrash {
  if (typeof data !== "object" || data === null) return [];
  const raw = data as Record<string, unknown>;
  if (raw.version !== MAP_TRASH_VERSION || !Array.isArray(raw.maps)) return [];
  const out: TrashedMap[] = [];
  for (const entry of raw.maps as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name, boxes, deletedAt } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id || out.some((m) => m.id === id)) continue;
    out.push({
      id: id as MapId,
      name: typeof name === "string" ? name : "",
      boxes: typeof boxes === "number" && Number.isInteger(boxes) && boxes >= 0 ? boxes : 0,
      deletedAt: typeof deletedAt === "number" && Number.isFinite(deletedAt) ? deletedAt : 0,
    });
  }
  return out;
}
