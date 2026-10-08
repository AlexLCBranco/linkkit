import { LINK_FIELDS, MAP_FIELDS, NODE_FIELDS, TRASH_ENTRY_FIELDS, unknownFields } from "./extras";
import { basicLinkCheck } from "./rules";
import type {
  ArrowLength,
  ArrowStyle,
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
  SiblingOrder,
  Size,
  TrashEntry,
  TrashPlace,
} from "./types";
import { clampArrowLength } from "./map";
import { isOrdered, normalizeOrder, sameOrder } from "./order";
import { UNTITLED_MAP } from "./names";
import { repairTree } from "./tree";
import {
  ARROW_LENGTH_PRESETS,
  ARROW_STYLES,
  DEFAULT_LINK_LABELS,
  LAYOUT_DIRECTIONS,
  MAP_KINDS,
  NODE_STATUSES,
  PALETTE_COLORS,
} from "./types";

/**
 * The saved shape of a map, and how to read it back safely. Pure: where it
 * is stored (localStorage) is the store's business.
 *
 * The version number is written from the first release, before there is
 * anything to migrate, because that is the only moment adding one is free
 * (same reasoning as Treekit and Boardkit).
 */
export const SCHEMA_VERSION = 1;

export { UNTITLED_MAP } from "./names";

/**
 * `rev`: a count raised by every write of a stored map, so a tab can tell
 * that another tab saved the map since it last read it (see `merge.ts`).
 * Only stored records have one (an exported map doesn't). Added without a
 * new version number on purpose: an older Linkkit still open in another
 * tab reads a record with `rev` as before, where a new version would make
 * it call the map unreadable and set it aside.
 */
export interface PersistedMap {
  readonly version: typeof SCHEMA_VERSION;
  readonly rev?: number;
  readonly map: LinkMap;
}

/**
 * A linked tree's stored record (shared store, bridge step 3): version 2,
 * the map with its `linkedBoard`. The map is Linkkit's own parts (places,
 * colours, labels, collapse, ...) plus a copy of the shared parts as
 * Linkkit last saw them. The copy is never the truth while the board can be
 * read: the tree is built from the board each time it opens. It is what
 * Linkkit keeps when the board is deleted in Boardkit, or can't be read
 * (decided by the owner, 2026-10-07).
 *
 * A new version on purpose: an older Linkkit calls it unreadable rather
 * than open the copy as an ordinary tree and save over the link.
 */
export const LINKED_SCHEMA_VERSION = 2;

export interface PersistedLinkedMap {
  readonly version: typeof LINKED_SCHEMA_VERSION;
  readonly rev: number;
  readonly map: LinkMap & { readonly linkedBoard: string };
}

/** What `linkkit:map:<id>` stores: a linked tree as version 2, any other
    map as version 1. */
export function serializeStored(map: LinkMap, rev: number): PersistedMap | PersistedLinkedMap {
  const plain = serializeMap(map, rev);
  if (!map.linkedBoard) return plain;
  const { heldNotes, cardNotesShared } = map;
  return {
    version: LINKED_SCHEMA_VERSION,
    rev,
    map: {
      ...plain.map,
      linkedBoard: map.linkedBoard,
      ...(heldNotes && Object.keys(heldNotes).length ? { heldNotes } : {}),
      ...(cardNotesShared ? { cardNotesShared } : {}),
    },
  };
}

/** A stored record's `rev`, or 0 when it has none (saved before there was
    one) or it isn't a record. */
export function revOf(data: unknown): number {
  const rev = isObject(data) ? data.rev : undefined;
  return typeof rev === "number" && Number.isSafeInteger(rev) && rev >= 0 ? rev : 0;
}

export function serializeMap(map: LinkMap, rev?: number): PersistedMap {
  const { id, name, kind, page, direction, arrowLength, arrowStyle, nodes, links, order, hideCut, collapsed, trash } = map;
  // The content fields, plus any field a newer Linkkit added that this
  // build doesn't know (`extras.ts`): an older tab must never drop it.
  // Never `linkedBoard`: an exported map is an ordinary tree (see
  // `serializeStored`).
  return {
    version: SCHEMA_VERSION,
    ...(rev === undefined ? {} : { rev }),
    map: {
      ...unknownFields(map, MAP_FIELDS),
      id,
      name,
      kind,
      page: { width: page.width, height: page.height },
      direction,
      arrowLength,
      arrowStyle,
      nodes,
      links,
      order,
      hideCut,
      collapsed,
      trash,
      ...(map.noteClashes && Object.keys(map.noteClashes).length ? { noteClashes: map.noteClashes } : {}),
    },
  };
}

export type MapRead =
  | { readonly status: "ok"; readonly map: LinkMap }
  /** Some of it was damaged; `map` is what could be recovered. */
  | { readonly status: "repaired"; readonly map: LinkMap; readonly fixes: number }
  | { readonly status: "unreadable" };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSize = (value: number) => Number.isFinite(value) && value > 0;

/**
 * Validates saved data and repairs what it can. Saved data can be damaged
 * by a bug in an older version, a hand edit, or a half-written save, and a
 * broken map must never crash the app on load.
 *
 * Repairs: fields with the wrong type get defaults (a box with no usable
 * position goes to the page's top-left corner; a bad page size becomes
 * `fallbackPage`); arrows every kind refuses (a missing end, a box linking
 * to itself, an exact repeat: `basicLinkCheck`) are dropped; an empty arrow
 * label becomes "needs" in a connections map (a tree's arrows have none).
 * A tree's own shape (one start, no loose boxes, no loops) is repaired
 * by `repairTree` (tree.ts): arrows dropped or added, never a box.
 * `unreadable` is kept for data with nothing to salvage,
 * or with an unknown version or kind (possibly from a newer Linkkit --
 * "repairing" it would destroy what that version wrote).
 */
export function readMap(data: unknown, fallbackPage: Size): MapRead {
  if (!isObject(data) || !isObject(data.map)) return { status: "unreadable" };
  const raw = data.map;
  if (typeof raw.id !== "string" || !raw.id) return { status: "unreadable" };
  if (!MAP_KINDS.includes(raw.kind as MapKind)) return { status: "unreadable" };
  const kind = raw.kind as MapKind;
  // Version 2 is a linked tree, and only that (see `PersistedLinkedMap`).
  const linked = data.version === LINKED_SCHEMA_VERSION;
  if (!linked && data.version !== SCHEMA_VERSION) return { status: "unreadable" };
  if (linked && (kind !== "tree" || typeof raw.linkedBoard !== "string" || !raw.linkedBoard)) {
    return { status: "unreadable" };
  }
  const link = linked ? { linkedBoard: raw.linkedBoard as string } : {};

  let fixes = 0;
  const fix = <T>(value: T): T => {
    fixes++;
    return value;
  };

  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name : fix(UNTITLED_MAP);

  const rawPage = isObject(raw.page) ? raw.page : {};
  const page: Size =
    typeof rawPage.width === "number" && typeof rawPage.height === "number" && isSize(rawPage.width) && isSize(rawPage.height)
      ? { width: rawPage.width, height: rawPage.height }
      : fix(fallbackPage);

  // Saves from before the direction existed have none: they were top-down.
  // That is not damage, so it is not counted as a repair.
  const direction: LayoutDirection =
    raw.direction === undefined
      ? "TB"
      : LAYOUT_DIRECTIONS.includes(raw.direction as LayoutDirection)
        ? (raw.direction as LayoutDirection)
        : fix("TB");

  // Likewise the arrow length: older saves were tidied at medium. Saves
  // from v0.0.12, when there were only the presets, name one ("long").
  const rawLength = raw.arrowLength;
  const arrowLength: ArrowLength =
    rawLength === undefined
      ? ARROW_LENGTH_PRESETS.medium
      : typeof rawLength === "string" && Object.hasOwn(ARROW_LENGTH_PRESETS, rawLength)
        ? ARROW_LENGTH_PRESETS[rawLength as keyof typeof ARROW_LENGTH_PRESETS]
        : typeof rawLength === "number" && Number.isFinite(rawLength)
          ? clampArrowLength(rawLength) === rawLength
            ? rawLength
            : fix(clampArrowLength(rawLength))
          : fix(ARROW_LENGTH_PRESETS.medium);

  // Likewise the arrow style: older saves drew straight arrows.
  const arrowStyle: ArrowStyle =
    raw.arrowStyle === undefined
      ? "straight"
      : ARROW_STYLES.includes(raw.arrowStyle as ArrowStyle)
        ? (raw.arrowStyle as ArrowStyle)
        : fix("straight");

  // Boxes.
  const rawNodes: Record<string, unknown> = isObject(raw.nodes) ? raw.nodes : fix({});
  const nodes: Record<NodeId, MapNode> = {};
  for (const [key, node] of Object.entries(rawNodes)) {
    if (!isObject(node)) {
      fix(null);
      continue;
    }
    if (node.id !== key) fix(null);
    nodes[key as NodeId] = readNode(key as NodeId, node, kind, fix);
  }

  // Arrows: each one is checked with the arrows kept so far, so an exact
  // repeat is caught the same way the UI would catch it. Only the checks
  // every kind shares: a tree's "nothing into the start" can't be judged
  // one arrow at a time (every box looks like a start before its arrow).
  const rawLinks: Record<string, unknown> = isObject(raw.links) ? raw.links : fix({});
  const links: Record<LinkId, Link> = {};
  // Older saves have no "hide cut": shown. Only a tree hides anything.
  const hideCut =
    raw.hideCut === undefined
      ? false
      : typeof raw.hideCut === "boolean" && (kind === "tree" || !raw.hideCut)
        ? raw.hideCut
        : fix(false);

  // Older saves have nothing collapsed. A box that isn't there (or any
  // entry in a connections map) is dropped as a repair.
  const rawCollapsed = raw.collapsed === undefined ? [] : Array.isArray(raw.collapsed) ? raw.collapsed : fix([]);
  const collapsed = [
    ...new Set(rawCollapsed.filter((c): c is NodeId => typeof c === "string" && kind === "tree" && !!nodes[c as NodeId])),
  ];
  if (collapsed.length !== rawCollapsed.length) fix(null);

  const map: LinkMap = {
    // Fields a newer Linkkit added ride along untouched (`extras.ts`).
    ...unknownFields(raw, MAP_FIELDS),
    id: raw.id as MapId,
    name,
    kind,
    page,
    direction,
    arrowLength,
    arrowStyle,
    nodes,
    links,
    order: {},
    hideCut,
    collapsed,
    trash: readTrash(raw.trash, nodes, kind, fix),
    ...link,
    ...readNotesAside(raw, linked, fix),
  };
  for (const [key, link] of Object.entries(rawLinks)) {
    if (!isObject(link) || typeof link.from !== "string" || typeof link.to !== "string") {
      fix(null);
      continue;
    }
    const from = link.from as NodeId;
    const to = link.to as NodeId;
    if (!basicLinkCheck(map, from, to).ok) {
      fix(null);
      continue;
    }
    if (link.id !== key) fix(null);
    const id = key as LinkId;
    const fallback = DEFAULT_LINK_LABELS[kind];
    const label =
      typeof link.label === "string" && (link.label.trim() || link.label === fallback) ? link.label : fix(fallback);
    links[id] = { ...unknownFields(link, LINK_FIELDS), id, from, to, label };
  }

  // Sibling order (trees only). A tree saved before it existed has none: its
  // next steps take the order they show on the page, which is not damage.
  // A stored order is cleaned against the arrows (a box listed under a
  // parent that doesn't lead to it is dropped, one missing is added where
  // it sits); any change there counts as a repair.
  //
  // A tree's shape is repaired first (`repairTree`), so the order is
  // cleaned against the repaired arrows; a box it attached to the start
  // is listed last there, and order changes that follow from the repair
  // are part of it, not fixes of their own.
  let read: LinkMap = map;
  if (isOrdered(map)) {
    const stored = readOrder(raw.order, fix);
    const repaired = repairTree({ ...map, order: stored });
    fixes += repaired.fixes;
    const order = normalizeOrder(repaired.map, direction);
    if (raw.order !== undefined && repaired.fixes === 0 && !sameOrder(order, stored)) fix(null);
    read = { ...repaired.map, order };
  } else if (raw.order !== undefined && !(isObject(raw.order) && Object.keys(raw.order).length === 0)) {
    fix(null);
  }

  return fixes === 0 ? { status: "ok", map: read } : { status: "repaired", map: read, fixes };
}

/** Text kept by box id (`noteClashes`, `heldNotes`): the string entries
    that aren't blank; anything else is a fix. */
function readNoteRecord(raw: unknown, fix: <T>(value: T) => T): Record<NodeId, string> {
  if (raw === undefined) return {};
  if (!isObject(raw)) return fix({});
  const out: Record<NodeId, string> = {};
  for (const [id, text] of Object.entries(raw)) {
    if (id === "__proto__") continue;
    if (typeof text === "string" && text.trim()) out[id as NodeId] = text;
    else fix(null);
  }
  return out;
}

/** The notes kept beside the boxes: clashes (any map), and for a linked
    map the held notes and whether card notes are shared. Fields that are
    empty are left out, so an older save reads the same. */
function readNotesAside(raw: Record<string, unknown>, linked: boolean, fix: <T>(value: T) => T): Partial<LinkMap> {
  const clashes = readNoteRecord(raw.noteClashes, fix);
  const held = linked ? readNoteRecord(raw.heldNotes, fix) : {};
  return {
    ...(Object.keys(clashes).length ? { noteClashes: clashes } : {}),
    ...(Object.keys(held).length ? { heldNotes: held } : {}),
    ...(linked && raw.cardNotesShared === true ? { cardNotesShared: true as const } : {}),
  };
}

/** One box, with defaults for fields of the wrong type (each a fix). */
function readNode(id: NodeId, node: Record<string, unknown>, kind: MapKind, fix: <T>(value: T) => T): MapNode {
  const name = typeof node.name === "string" ? node.name : fix("");
  const x = typeof node.x === "number" && Number.isFinite(node.x) ? node.x : fix(0);
  const y = typeof node.y === "number" && Number.isFinite(node.y) ? node.y : fix(0);
  const color =
    node.color === null || PALETTE_COLORS.includes(node.color as PaletteColor)
      ? (node.color as PaletteColor | null)
      : fix(null);
  // Saves from before statuses existed have none: not damage. Only a
  // tree's boxes have one.
  const status =
    node.status === undefined || node.status === null
      ? null
      : kind === "tree" && NODE_STATUSES.includes(node.status as NodeStatus)
        ? (node.status as NodeStatus)
        : fix(null);
  // Saves from before notes existed have none: not damage. An empty one
  // is the same as none (never stored).
  const notes = node.notes === undefined ? "" : typeof node.notes === "string" ? node.notes : fix("");
  const extra = unknownFields(node, NODE_FIELDS);
  return notes.trim() ? { ...extra, id, name, x, y, color, status, notes } : { ...extra, id, name, x, y, color, status };
}

/**
 * The map's trash. Saves from before the trash existed have none: not
 * damage. An entry that isn't whole and well formed is dropped (one fix):
 * a half entry could not be put back as it was. So is one holding a box
 * that is on the map, or in an earlier entry (a box is in one place only).
 */
function readTrash(
  raw: unknown,
  onMap: Readonly<Record<NodeId, MapNode>>,
  kind: MapKind,
  fix: <T>(value: T) => T,
): TrashEntry[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return fix([]);
  const seen = new Set<string>(Object.keys(onMap));
  const trash: TrashEntry[] = [];
  for (const entry of raw as unknown[]) {
    const read = readTrashEntry(entry, seen, kind);
    if (!read) {
      fix(null);
      continue;
    }
    for (const node of read.nodes) seen.add(node.id);
    trash.push(read);
  }
  return trash;
}

function readTrashEntry(raw: unknown, seen: ReadonlySet<string>, kind: MapKind): TrashEntry | null {
  if (!isObject(raw) || typeof raw.deletedAt !== "number" || !Number.isFinite(raw.deletedAt)) return null;
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0 || !Array.isArray(raw.links)) return null;
  // Strict: any default a box would need makes the entry damaged.
  let bad = false;
  const strict = <T>(value: T): T => {
    bad = true;
    return value;
  };
  const nodes: MapNode[] = [];
  for (const node of raw.nodes as unknown[]) {
    if (!isObject(node) || typeof node.id !== "string" || !node.id || seen.has(node.id)) return null;
    if (nodes.some((n) => n.id === node.id)) return null;
    nodes.push(readNode(node.id as NodeId, node, kind, strict));
  }
  const ids = new Set<string>(nodes.map((n) => n.id));
  const links: Link[] = [];
  for (const link of raw.links as unknown[]) {
    if (!isObject(link)) return null;
    const { id, from, to, label } = link;
    if (typeof id !== "string" || typeof from !== "string" || typeof to !== "string" || typeof label !== "string") return null;
    if (!ids.has(from) && !ids.has(to)) return null;
    links.push({ ...unknownFields(link, LINK_FIELDS), id: id as LinkId, from: from as NodeId, to: to as NodeId, label });
  }
  const rawPlaces = raw.places === undefined ? [] : raw.places;
  if (!Array.isArray(rawPlaces)) return null;
  const places: TrashPlace[] = [];
  for (const place of rawPlaces as unknown[]) {
    if (!isObject(place) || typeof place.parent !== "string" || typeof place.child !== "string") return null;
    if (typeof place.index !== "number" || !Number.isInteger(place.index) || place.index < 0) return null;
    places.push({ parent: place.parent as NodeId, child: place.child as NodeId, index: place.index });
  }
  return bad ? null : { ...unknownFields(raw, TRASH_ENTRY_FIELDS), deletedAt: raw.deletedAt, nodes, links, places };
}

/** The saved order's well-formed entries (lists of ids); anything else is
    reported to `fix` and left out. Missing entirely is fine (older save). */
function readOrder(raw: unknown, fix: <T>(value: T) => T): SiblingOrder {
  if (raw === undefined) return {};
  if (!isObject(raw)) return fix({});
  const order: Record<NodeId, readonly NodeId[]> = {};
  for (const [parent, list] of Object.entries(raw)) {
    if (!Array.isArray(list) || !list.every((c) => typeof c === "string")) {
      fix(null);
      continue;
    }
    order[parent as NodeId] = list as NodeId[];
  }
  return order;
}
