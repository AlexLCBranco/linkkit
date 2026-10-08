import { withNotes } from "./map";
import { isOrdered, normalizeOrder } from "./order";
import { basicLinkCheck } from "./rules";
import { trashEntryId } from "./trash";
import { repairTree } from "./tree";
import type { Link, LinkId, LinkMap, MapNode, NodeId, SiblingOrder, TrashEntry } from "./types";

/**
 * Merging two tabs' versions of one map. Pure: the store
 * (`store/persistMap.ts`) decides when, this decides what the result is.
 * Boardkit's `domain/merge.ts` does the same for its boards, by the same
 * rule, so the two apps behave alike.
 *
 * The problem: two tabs hold the same map. Each writes the whole record,
 * so the second write would erase the first's change. Every record carries
 * `rev`, so a tab can tell that someone else stored the map since it last
 * read it. Then it has three versions:
 *
 *  - `base`: the map as this tab last read or wrote it,
 *  - `mine`: the map as it is in this tab now,
 *  - `theirs`: the map as the other tab stored it.
 *
 * The rule (decided with the owner, see PROJECT.md, the shared store
 * design): take theirs, and re-apply this tab's own changes (`base` to
 * `mine`) on top, item by item. When both tabs changed the same item,
 * theirs stays and the item is named in `conflicts`, so the user can be
 * told. The items:
 *
 *  - a box, one field at a time: its name, its colour, its status, its
 *    notes, its place (x and y together). A box renamed here and moved there keeps
 *    both changes. A box deleted on one side and changed on the other
 *    stays as the other tab has it (deleted, or there);
 *  - an arrow, whole (its ends and its label);
 *  - where a box sits among its parent's next steps (trees): re-applied
 *    next to the same neighbour, not at an index, so a box the other tab
 *    added to the same parent keeps its own place too;
 *  - the map's own settings, one at a time: name, direction, arrow
 *    length, hide cut, page size;
 *  - a trash entry, whole.
 *
 * Collapse is a view setting: each box's flag is merged on its own, this
 * tab's change winning, never named as a conflict (Boardkit's folded
 * lists work the same way).
 *
 * The result is then made whole again: arrows to a box that is gone are
 * dropped, an arrow repeated by both tabs is kept once, and a tree is put
 * back into a tree's shape (`repairTree`: two tabs can each add an arrow
 * that is fine alone, and together close a loop).
 */

/** An item both tabs changed, where the other tab's version was kept. */
export interface MergeConflict {
  readonly kind: "box" | "arrow" | "map";
  /** What to call it in a message: its name as the other tab has it, or as
      this tab had it when the other tab deleted it. */
  readonly title: string;
}

export interface MapMerge {
  readonly map: LinkMap;
  readonly conflicts: readonly MergeConflict[];
}

/** Deep equality for saved data (plain objects, arrays and values). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = Object.keys(ra);
  if (keys.length !== Object.keys(rb).length) return false;
  return keys.every((key) => Object.hasOwn(rb, key) && sameValue(ra[key], rb[key]));
}

const CONTENT_KEYS = [
  "id",
  "name",
  "kind",
  "page",
  "direction",
  "arrowLength",
  "arrowStyle",
  "nodes",
  "links",
  "order",
  "hideCut",
  "collapsed",
  "trash",
  "linkedBoard",
] as const satisfies readonly (keyof LinkMap)[];

/** Every field either map has: the known ones, plus any a newer Linkkit
    added that this build doesn't know (`extras.ts`). */
const fieldsOf = (...maps: LinkMap[]): string[] => [...new Set([...CONTENT_KEYS, ...maps.flatMap((m) => Object.keys(m))])];

/** Any field of a map by name, known or not. */
const fieldOf = (map: LinkMap, key: string): unknown => (map as unknown as Record<string, unknown>)[key];

/** Whether two maps hold the same saved content (unknown fields too). */
export const sameMap = (a: LinkMap, b: LinkMap): boolean =>
  a === b || fieldsOf(a, b).every((key) => sameValue(fieldOf(a, key), fieldOf(b, key)));

/**
 * Ids in `order` that are not part of the longest run they share, in order,
 * with `before`: the ones that were added or moved, as opposed to the ones
 * that merely shifted because something else moved (Boardkit's).
 */
export function movedIds<T>(before: readonly T[], order: readonly T[]): Set<T> {
  const n = before.length;
  const m = order.length;
  // lengths[i][j]: longest common run of before[i..] and order[j..].
  const lengths: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i][j] =
        before[i] === order[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const kept = new Set<T>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (before[i] === order[j]) {
      kept.add(order[j]);
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
    else j++;
  }
  return new Set(order.filter((id) => !kept.has(id)));
}

/** Inserts `id` into `order` right after `after`, or first when `after` is
    `null` or not in it. */
function insertAfter<T>(order: T[], id: T, after: T | null): void {
  const index = after === null ? -1 : order.indexOf(after);
  order.splice(index + 1, 0, id);
}

/** The item before `id` in `mineOrder` that is also in `resultOrder`: where
    `id` goes, so it lands next to the same neighbour it has in this tab. */
function anchorOf<T>(mineOrder: readonly T[], id: T, resultOrder: readonly T[]): T | null {
  for (let i = mineOrder.indexOf(id) - 1; i >= 0; i--) {
    if (resultOrder.includes(mineOrder[i])) return mineOrder[i];
  }
  return null;
}

function idsOf<K extends string>(...records: Readonly<Record<K, unknown>>[]): Set<K> {
  const ids = new Set<K>();
  for (const record of records) for (const id of Object.keys(record) as K[]) ids.add(id);
  return ids;
}

const nameOf = (node: MapNode | undefined, fallback: string) => node?.name.trim() || fallback;

/** A box's fields, as the merge sees them: each merged on its own. */
const BOX_FIELDS = {
  name: (n: MapNode) => n.name,
  color: (n: MapNode) => n.color,
  status: (n: MapNode) => n.status,
  notes: (n: MapNode) => n.notes ?? "",
  place: (n: MapNode) => ({ x: n.x, y: n.y }),
} as const;

/** Writes one of `BOX_FIELDS` from `from` into `into`. */
function withField(into: MapNode, from: MapNode, field: keyof typeof BOX_FIELDS): MapNode {
  switch (field) {
    case "name":
      return { ...into, name: from.name };
    case "color":
      return { ...into, color: from.color };
    case "status":
      return { ...into, status: from.status };
    case "notes":
      return withNotes(into, from.notes ?? "");
    case "place":
      return { ...into, x: from.x, y: from.y };
  }
}

/** Boxes: theirs, with this tab's new, changed and deleted boxes re-applied
    where the other tab left them alone. */
function mergeNodes(base: LinkMap, mine: LinkMap, theirs: LinkMap, conflicts: MergeConflict[]) {
  const nodes: Record<NodeId, MapNode> = { ...theirs.nodes };
  /** Boxes deleted here that stay, because the other tab changed them. */
  const keptBack = new Set<NodeId>();
  for (const id of idsOf(base.nodes, mine.nodes)) {
    const before = base.nodes[id];
    const mineNode = mine.nodes[id];
    const theirNode = theirs.nodes[id];
    if (before === mineNode || sameValue(before, mineNode)) continue;
    if (!before) {
      // New here (ids are random, so the other tab can't have made it too).
      if (mineNode && !theirNode) nodes[id] = mineNode;
      continue;
    }
    if (!mineNode) {
      // Deleted here: gone, unless the other tab changed it meanwhile.
      if (theirNode && sameValue(before, theirNode)) delete nodes[id];
      else if (theirNode) {
        keptBack.add(id);
        conflicts.push({ kind: "box", title: nameOf(theirNode, "A box") });
      }
      continue;
    }
    if (!theirNode) {
      // Changed here, deleted there: their delete stands.
      conflicts.push({ kind: "box", title: nameOf(mineNode, "A box") });
      continue;
    }
    let node = theirNode;
    let clash = false;
    for (const field of Object.keys(BOX_FIELDS) as (keyof typeof BOX_FIELDS)[]) {
      const read = BOX_FIELDS[field];
      if (sameValue(read(before), read(mineNode))) continue;
      if (sameValue(read(before), read(theirNode))) node = withField(node, mineNode, field);
      else if (!sameValue(read(mineNode), read(theirNode))) clash = true;
    }
    nodes[id] = node;
    if (clash) conflicts.push({ kind: "box", title: nameOf(theirNode, "A box") });
  }
  return { nodes, keptBack };
}

/** Arrows, whole: the same rule as boxes. A box whose delete here lost
    (`keptBack`) keeps its arrows too: the delete took them, so they stay
    with it. */
function mergeLinks(
  base: LinkMap,
  mine: LinkMap,
  theirs: LinkMap,
  keptBack: ReadonlySet<NodeId>,
  conflicts: MergeConflict[],
) {
  const links: Record<LinkId, Link> = { ...theirs.links };
  const title = (link: Link) => {
    const to = theirs.nodes[link.to] ?? mine.nodes[link.to];
    return to ? `The arrow into “${nameOf(to, "a box")}”` : "An arrow";
  };
  for (const id of idsOf(base.links, mine.links)) {
    const before = base.links[id];
    const mineLink = mine.links[id];
    const theirLink = theirs.links[id];
    if (before === mineLink || sameValue(before, mineLink)) continue;
    if (sameValue(before, theirLink)) {
      if (mineLink) links[id] = mineLink;
      else if (!(before && (keptBack.has(before.from) || keptBack.has(before.to)))) delete links[id];
    } else if (!sameValue(mineLink, theirLink)) {
      conflicts.push({ kind: "arrow", title: title(theirLink ?? mineLink ?? before) });
    }
  }
  return links;
}

/** Each parent's next steps: theirs, with the boxes this tab added or moved
    put back next to the neighbour they have here. Cleaned against the
    arrows afterwards (`normalizeOrder`), so a stale entry does no harm. */
function mergeOrder(base: LinkMap, mine: LinkMap, theirs: LinkMap): SiblingOrder {
  const order: Record<NodeId, NodeId[]> = {};
  for (const parent of Object.keys(theirs.order) as NodeId[]) order[parent] = [...theirs.order[parent]];
  for (const parent of Object.keys(mine.order) as NodeId[]) {
    const mineList = mine.order[parent];
    const moved = movedIds(base.order[parent] ?? [], mineList);
    // Theirs moved it too: theirs stays (the arrows decide where it is).
    const theirMoved = movedIds(base.order[parent] ?? [], theirs.order[parent] ?? []);
    const take = [...moved].filter((id) => !theirMoved.has(id));
    if (take.length === 0) continue;
    const list = (order[parent] ?? []).filter((id) => !take.includes(id));
    for (const id of mineList) if (take.includes(id)) insertAfter(list, id, anchorOf(mineList, id, list));
    order[parent] = list;
  }
  return order;
}

/** One map setting: mine if only this tab changed it, else theirs. */
function setting<K extends keyof LinkMap>(
  key: K,
  base: LinkMap,
  mine: LinkMap,
  theirs: LinkMap,
  conflicts: MergeConflict[],
): LinkMap[K] {
  if (sameValue(base[key], mine[key])) return theirs[key];
  if (sameValue(base[key], theirs[key])) return mine[key];
  if (!sameValue(mine[key], theirs[key])) conflicts.push({ kind: "map", title: theirs.name });
  return theirs[key];
}

/** Each box's collapse flag on its own, this tab's change winning. */
function mergeCollapsed(base: LinkMap, mine: LinkMap, theirs: LinkMap, nodes: Readonly<Record<NodeId, MapNode>>) {
  const was = new Set(base.collapsed);
  const now = new Set(mine.collapsed);
  const result = theirs.collapsed.filter((id) => !(was.has(id) && !now.has(id)));
  for (const id of mine.collapsed) if (!was.has(id) && !result.includes(id)) result.push(id);
  return result.filter((id) => nodes[id]);
}

/**
 * Trash entries, whole: theirs, plus the entries this tab added, minus the
 * ones it restored or erased. A box can be in one place only, so a box
 * back on the map (the other tab changed it, so its delete here lost) is
 * taken out of its entry; an entry left with no boxes goes.
 */
function mergeTrash(base: LinkMap, mine: LinkMap, theirs: LinkMap, nodes: Readonly<Record<NodeId, MapNode>>) {
  const ids = (trash: readonly TrashEntry[]) => new Set(trash.map(trashEntryId));
  const baseIds = ids(base.trash);
  const mineIds = ids(mine.trash);
  const removedHere = new Set([...baseIds].filter((id) => !mineIds.has(id)));
  const entries = [
    ...theirs.trash.filter((e) => !removedHere.has(trashEntryId(e))),
    ...mine.trash.filter((e) => !baseIds.has(trashEntryId(e))),
  ].sort((a, b) => a.deletedAt - b.deletedAt);

  const seen = new Set<NodeId>(Object.keys(nodes) as NodeId[]);
  const trash: TrashEntry[] = [];
  for (const entry of entries) {
    const kept = entry.nodes.filter((n) => !seen.has(n.id));
    for (const n of kept) seen.add(n.id);
    if (kept.length === entry.nodes.length) trash.push(entry);
    else if (kept.length > 0) {
      const ids = new Set(kept.map((n) => n.id));
      trash.push({
        ...entry,
        nodes: kept,
        links: entry.links.filter((l) => ids.has(l.from) || ids.has(l.to)),
        places: entry.places.filter((p) => ids.has(p.child)),
      });
    }
  }
  return trash;
}

/** Arrows whose boxes are both there, each pair once (the first kept). */
function wholeLinks(map: LinkMap): LinkMap {
  let next: LinkMap = { ...map, links: {} };
  for (const link of Object.values(map.links)) {
    if (!basicLinkCheck(next, link.from, link.to).ok) continue;
    next = { ...next, links: { ...next.links, [link.id]: link } };
  }
  return next;
}

/** The fields `mergeMaps` merges in its own way; any other is merged whole. */
const MERGED_FIELDS: ReadonlySet<string> = new Set([
  ...CONTENT_KEYS,
]);

/**
 * Theirs, with this tab's changes since `base` re-applied wherever the
 * other tab left that item alone. See the file comment.
 */
export function mergeMaps(base: LinkMap, mine: LinkMap, theirs: LinkMap): MapMerge {
  if (sameMap(base, mine)) return { map: theirs, conflicts: [] };
  if (sameMap(base, theirs) || sameMap(mine, theirs)) return { map: mine, conflicts: [] };

  const conflicts: MergeConflict[] = [];
  const { nodes, keptBack } = mergeNodes(base, mine, theirs, conflicts);
  const links = mergeLinks(base, mine, theirs, keptBack, conflicts);
  const settings = {
    name: setting("name", base, mine, theirs, conflicts),
    page: setting("page", base, mine, theirs, conflicts),
    direction: setting("direction", base, mine, theirs, conflicts),
    arrowLength: setting("arrowLength", base, mine, theirs, conflicts),
    arrowStyle: setting("arrowStyle", base, mine, theirs, conflicts),
    hideCut: setting("hideCut", base, mine, theirs, conflicts),
  };

  let map: LinkMap = wholeLinks({
    ...theirs,
    ...settings,
    nodes,
    links,
    order: isOrdered(theirs) ? mergeOrder(base, mine, theirs) : {},
    collapsed: mergeCollapsed(base, mine, theirs, nodes),
    trash: mergeTrash(base, mine, theirs, nodes),
  });
  // Any other field (one a newer Linkkit added, say): whole, like a setting.
  const merged = map as unknown as Record<string, unknown>;
  for (const key of fieldsOf(base, mine, theirs)) {
    if (MERGED_FIELDS.has(key)) continue;
    const [b, m, t] = [base, mine, theirs].map((x) => fieldOf(x, key));
    const value = sameValue(b, m) ? t : sameValue(b, t) ? m : t;
    if (!sameValue(b, m) && !sameValue(b, t) && !sameValue(m, t)) conflicts.push({ kind: "map", title: theirs.name });
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  if (isOrdered(map)) {
    map = repairTree(map).map;
    map = { ...map, order: normalizeOrder(map, map.direction) };
  }

  // One name per item, in the order found.
  const named = new Set<string>();
  const unique = conflicts.filter((c) => {
    const key = `${c.kind}:${c.title}`;
    if (named.has(key)) return false;
    named.add(key);
    return true;
  });
  return { map, conflicts: unique };
}

/**
 * `next`, but reusing `previous`'s objects wherever they hold the same
 * content -- the whole map, a part of it, or one box. A map read back
 * from storage is all new objects; put on screen as it is, every box would
 * re-render for a change to one of them. With this, only what really
 * changed has a new reference, so narrow subscriptions stay narrow.
 */
export function shareUnchanged(previous: LinkMap, next: LinkMap): LinkMap {
  if (sameMap(previous, next)) return previous;
  const keep = <T>(a: T, b: T): T => (sameValue(a, b) ? a : b);
  return {
    ...next,
    page: keep(previous.page, next.page),
    nodes: shareRecord(previous.nodes, next.nodes),
    links: shareRecord(previous.links, next.links),
    order: shareRecord(previous.order, next.order),
    collapsed: keep(previous.collapsed, next.collapsed),
    trash: keep(previous.trash, next.trash),
  };
}

function shareRecord<K extends string, V>(
  previous: Readonly<Record<K, V>>,
  next: Readonly<Record<K, V>>,
): Readonly<Record<K, V>> {
  if (sameValue(previous, next)) return previous;
  const shared = {} as Record<K, V>;
  for (const key of Object.keys(next) as K[]) {
    shared[key] = Object.hasOwn(previous, key) && sameValue(previous[key], next[key]) ? previous[key] : next[key];
  }
  return shared;
}
