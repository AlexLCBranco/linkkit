import { canLink } from "./rules";
import type { LayoutDirection, Link, LinkId, LinkMap, MapId, MapKind, MapNode, NodeId, PaletteColor, Size } from "./types";
import { DEFAULT_LINK_LABEL, LAYOUT_DIRECTIONS, MAP_KINDS, PALETTE_COLORS } from "./types";

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
  const { id, name, kind, page, direction, nodes, links } = map;
  // Copies out exactly the content fields, so nothing else that happens to
  // ride along on the object can leak into storage.
  return {
    version: SCHEMA_VERSION,
    map: { id, name, kind, page: { width: page.width, height: page.height }, direction, nodes, links },
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
 * `fallbackPage`); arrows the map's rules would refuse (a missing end, a
 * box needing itself, an exact repeat) are dropped; an empty arrow label
 * becomes "needs". `unreadable` is kept for data with nothing to salvage,
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
    nodes[id] = { id, name: nodeName, x, y, color };
  }

  // Arrows: each one is checked against the rules, with the arrows kept so
  // far, so an exact repeat is caught the same way the UI would catch it.
  const rawLinks: Record<string, unknown> = isObject(raw.links) ? raw.links : fix({});
  const links: Record<LinkId, Link> = {};
  const map: LinkMap = { id: raw.id as MapId, name, kind, page, direction, nodes, links };
  for (const [key, link] of Object.entries(rawLinks)) {
    if (!isObject(link) || typeof link.from !== "string" || typeof link.to !== "string") {
      fix(null);
      continue;
    }
    const from = link.from as NodeId;
    const to = link.to as NodeId;
    if (!canLink(map, from, to).ok) {
      fix(null);
      continue;
    }
    if (link.id !== key) fix(null);
    const id = key as LinkId;
    const label = typeof link.label === "string" && link.label.trim() ? link.label : fix(DEFAULT_LINK_LABEL);
    links[id] = { id, from, to, label };
  }

  return fixes === 0 ? { status: "ok", map } : { status: "repaired", map, fixes };
}
