import { basicLinkCheck } from "./rules";
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
  SiblingOrder,
  Size,
} from "./types";
import { clampArrowLength } from "./map";
import { isOrdered, normalizeOrder, sameOrder } from "./order";
import { repairTree } from "./tree";
import {
  ARROW_LENGTH_PRESETS,
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

export const UNTITLED_MAP = "Untitled map";

export interface PersistedMap {
  readonly version: typeof SCHEMA_VERSION;
  readonly map: LinkMap;
}

export function serializeMap(map: LinkMap): PersistedMap {
  const { id, name, kind, page, direction, arrowLength, nodes, links, order, hideCut, collapsed } = map;
  // Copies out exactly the content fields, so nothing else that happens to
  // ride along on the object can leak into storage.
  return {
    version: SCHEMA_VERSION,
    map: {
      id,
      name,
      kind,
      page: { width: page.width, height: page.height },
      direction,
      arrowLength,
      nodes,
      links,
      order,
      hideCut,
      collapsed,
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
  if (!isObject(data) || data.version !== SCHEMA_VERSION || !isObject(data.map)) return { status: "unreadable" };
  const raw = data.map;
  if (typeof raw.id !== "string" || !raw.id) return { status: "unreadable" };
  if (!MAP_KINDS.includes(raw.kind as MapKind)) return { status: "unreadable" };
  const kind = raw.kind as MapKind;

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

  // Boxes.
  const rawNodes: Record<string, unknown> = isObject(raw.nodes) ? raw.nodes : fix({});
  const nodes: Record<NodeId, MapNode> = {};
  for (const [key, node] of Object.entries(rawNodes)) {
    if (!isObject(node)) {
      fix(null);
      continue;
    }
    if (node.id !== key) fix(null);
    const id = key as NodeId;
    const nodeName = typeof node.name === "string" ? node.name : fix("");
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
    nodes[id] = { id, name: nodeName, x, y, color, status };
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
    id: raw.id as MapId,
    name,
    kind,
    page,
    direction,
    arrowLength,
    nodes,
    links,
    order: {},
    hideCut,
    collapsed,
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
    links[id] = { id, from, to, label };
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
