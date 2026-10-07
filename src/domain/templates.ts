import { createLinkId, createMapId, createNodeId } from "./ids";
import { createMap } from "./map";
import { parseOutline, pasteOutline } from "./outline";
import { isUntitled, namingBox } from "./names";
import { readMap, serializeMap, type PersistedMap } from "./persistence";
import { createTree } from "./tree";
import type { Link, LinkId, LinkMap, MapId, MapKind, MapNode, NodeId, SiblingOrder, Size } from "./types";

/**
 * Templates (usability pass U6): ready-made maps to start from. Built-in
 * ones are written as outlines (`domain/outline.ts`); the user's own are
 * whole maps saved with "Save this map as a template", kept in the browser
 * like maps. Starting from either gives an ordinary map with fresh ids:
 * normal, editable boxes, nothing tied to the template.
 */

export interface BuiltInTemplate {
  readonly id: string;
  readonly name: string;
  /** What it is for, in a few words (the gallery's second line). */
  readonly blurb: string;
  readonly kind: MapKind;
  /** The boxes, one per line, nested by indentation. */
  readonly outline: string;
}

/** A template the user saved: a map as stored (no trash, never linked). */
export interface SavedTemplate {
  readonly id: string;
  readonly name: string;
  readonly savedAt: number;
  readonly map: PersistedMap;
}

const lines = (...rows: string[]) => rows.join("\n");

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  {
    id: "decision",
    name: "Weigh a decision",
    blurb: "Two options, the good and the bad of each",
    kind: "tree",
    outline: lines("Which should I choose?", "  Option A", "    Good", "    Bad", "  Option B", "    Good", "    Bad"),
  },
  {
    id: "project",
    name: "Project plan",
    blurb: "Goal, steps, risks and when it is done",
    kind: "tree",
    outline: lines("Project", "  Goal", "  Steps", "    First step", "    Next step", "    Last step", "  Risks", "  Done when"),
  },
  {
    id: "priorities",
    name: "Priorities",
    blurb: "Must, should, could and won't do",
    kind: "tree",
    outline: lines("This week", "  Must do", "  Should do", "  Could do", "  Won't do"),
  },
  {
    id: "whys",
    name: "Five whys",
    blurb: "Ask why until you reach the root cause",
    kind: "tree",
    outline: lines("Problem", "  Why?", "    Why?", "      Why?", "        Why?", "          Root cause"),
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    blurb: "One topic, ideas and questions around it",
    kind: "tree",
    outline: lines("Topic", "  Idea", "  Idea", "  Idea", "  Question"),
  },
  {
    id: "dependencies",
    name: "What it depends on",
    blurb: "A goal and what it needs, step by step",
    kind: "connections",
    outline: lines("Launch", "  Website", "    Design", "    Content", "  Announcement", "    Mailing list"),
  },
];

/** A built-in template as a map. Boxes start at 0, 0: whoever shows it
    tidies it once measured. */
export function builtInMap(template: BuiltInTemplate, page: Size, id: MapId = createMapId()): LinkMap {
  const [first, ...rest] = parseOutline(template.outline);
  const start = createNodeId();
  const blank =
    template.kind === "tree"
      ? createTree(id, template.name, page, first.text, start).map
      : { ...createMap(id, template.name, page), nodes: { [start]: { id: start, name: first.text, x: 0, y: 0, color: null, status: null } } };
  return pasteOutline(blank, start, first.text, rest, { x: 0, y: 0 }, createNodeId).map;
}

/**
 * `map` under new ids throughout (boxes, arrows, the map itself), with its
 * own name, no trash and no link: a fresh map that only looks like it.
 */
export function withFreshIds(
  map: LinkMap,
  id: MapId,
  name: string,
  newNode: () => NodeId = createNodeId,
  newLink: () => LinkId = createLinkId,
): LinkMap {
  const ids = new Map<NodeId, NodeId>(Object.keys(map.nodes).map((old) => [old as NodeId, newNode()]));
  const swap = (old: NodeId) => ids.get(old) ?? old;
  const nodes: Record<NodeId, MapNode> = {};
  for (const node of Object.values(map.nodes)) nodes[swap(node.id)] = { ...node, id: swap(node.id) };
  const links: Record<LinkId, Link> = {};
  for (const link of Object.values(map.links)) {
    const linkId = newLink();
    links[linkId] = { ...link, id: linkId, from: swap(link.from), to: swap(link.to) };
  }
  const order: Record<NodeId, readonly NodeId[]> = {};
  for (const [parent, kids] of Object.entries(map.order) as [NodeId, readonly NodeId[]][]) order[swap(parent)] = kids.map(swap);
  const { linkedBoard: _, ...rest } = map;
  return { ...rest, id, name, nodes, links, order: order as SiblingOrder, collapsed: map.collapsed.map(swap), trash: [] };
}

/** "Save this map as a template": the map as it is, without its trash or
    its link to Boardkit. Named after the map, or, while the map is still
    untitled, after its start (or first) box ("Party" rather than
    "Untitled map"). */
export function templateOf(map: LinkMap, id: string, savedAt: number): SavedTemplate {
  const start = namingBox(map);
  const name = isUntitled(map.name) && start && map.nodes[start].name ? map.nodes[start].name : map.name;
  return { id, name, savedAt, map: serializeMap({ ...map, name, trash: [] }) };
}

/** A saved template as a new map, or `null` if it can't be read. */
export function savedMap(template: SavedTemplate, page: Size, id: MapId = createMapId()): LinkMap | null {
  const read = readMap(template.map, page);
  if (read.status === "unreadable") return null;
  return withFreshIds(read.map, id, template.name);
}

export const TEMPLATES_VERSION = 1;

export function serializeTemplates(templates: readonly SavedTemplate[]) {
  return { version: TEMPLATES_VERSION, templates };
}

/** The saved templates in stored data; anything not whole is skipped. */
export function readTemplates(data: unknown): SavedTemplate[] {
  if (typeof data !== "object" || data === null) return [];
  const { version, templates } = data as Record<string, unknown>;
  if (version !== TEMPLATES_VERSION || !Array.isArray(templates)) return [];
  const out: SavedTemplate[] = [];
  const seen = new Set<string>();
  for (const entry of templates as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name, savedAt, map } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id || seen.has(id) || typeof name !== "string" || typeof savedAt !== "number") continue;
    if (readMap(map, { width: 800, height: 600 }).status === "unreadable") continue;
    seen.add(id);
    out.push({ id, name, savedAt, map: map as PersistedMap });
  }
  return out;
}
