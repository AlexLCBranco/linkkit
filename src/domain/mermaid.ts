import { createLinkId, createMapId, createNodeId } from "./ids";
import { cleanName, createMap } from "./map";
import { isUntitled, numberedName, UNTITLED_MAP } from "./names";
import { nextSteps, normalizeOrder } from "./order";
import { startOf } from "./tree";
import {
  DEFAULT_LINK_LABELS,
  NODE_STATUSES,
  PALETTE_COLORS,
  type Link,
  type LinkId,
  type LinkMap,
  type MapKind,
  type MapNode,
  type NodeId,
  type NodeStatus,
  type PaletteColor,
  type Size,
} from "./types";

/**
 * Mermaid `flowchart` <-> maps. Pure text in, text or maps out.
 *
 * The format is Treekit's (its `src/domain/mermaid.ts`), so a tree moves
 * Treekit -> Linkkit (and back) through Mermaid text. Export writes every
 * box (folded and cut ones included), the arrows with their labels, the
 * direction, box colours (`style` lines), notes (`%% notes` comment lines,
 * which Mermaid ignores and import reads back) and keep / maybe / cut (the
 * classes `keep`, `maybe`, `cut`). Linkkit adds two things Treekit's
 * import skips over: the map's name as Mermaid's own front-matter title,
 * and a `%% linkkit connections` line on a map without tree rules, so it
 * comes back as one.
 *
 * Import understands the common flowchart subset -- nodes with any bracket
 * shape, `-->` / `---` / `==>` / `-.->` links with `|label|` or
 * `-- label -->` text, chains (`A --> B --> C`) and `&` lists. Unlike
 * Treekit it refuses nothing a map can hold: each separate tree opens as
 * its own map with tree rules on (decided by the owner, one tree per map),
 * and whatever breaks tree rules (a loop, two starts sharing boxes) opens
 * as one map with tree rules off. (A box with two ways in is fine in a
 * Linkkit tree.) What can't come across is named in `warnings`.
 */

/**
 * Mermaid needs literal colours, so this mirrors `--palette-*` in
 * styles/tokens.css (and Treekit's list). Import matches a box's `stroke`
 * against these, so the two lists must stay in step.
 */
const PALETTE_HEX: Readonly<Record<PaletteColor, string>> = {
  slate: "#667085",
  red: "#e03131",
  orange: "#e8590c",
  yellow: "#f0b000",
  green: "#2f9e44",
  teal: "#0ca678",
  blue: "#4c6ef5",
  purple: "#9c36b5",
};

/** `hex` blended over white at `amount` (0-1): a pale fill that keeps text readable. */
function tint(hex: string, amount: number): string {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(value * amount + 255 * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** Marks a map without tree rules (a comment: Mermaid and Treekit skip it). */
const CONNECTIONS_LINE = "%% linkkit connections";

// ---------------------------------------------------------------- export

/** Text inside quotes: `#` first, so the entities we add are not re-escaped. */
function escapeText(text: string): string {
  return text
    .replace(/#/g, "#35;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/\|/g, "#124;")
    .replace(/\r?\n/g, "<br/>");
}

/** How each status looks in Mermaid's own renderer. Import only reads the
    class names, never these styles. */
const STATUS_STYLE: Readonly<Record<NodeStatus, string>> = {
  keep: "stroke-width:3px",
  maybe: "stroke-dasharray:3 3",
  cut: "opacity:0.45,stroke-dasharray:6 4",
};

const CLASS_SHORTHAND = /:::([\p{L}\p{N}_-]+)/uy;

function asStatus(name: string | null): NodeStatus | null {
  const lower = name?.toLowerCase();
  return NODE_STATUSES.find((status) => status === lower) ?? null;
}

/** The comment line that carries a box's notes: `%% notes n3 "text"`. */
const NOTES_LINE = /^%%\s*notes\s+([\p{L}\p{N}_]+)\s+"(.*)"\s*$/u;

/** Each box's arrows out, in the order they are read: a tree's sibling
    order, else the order they were drawn. */
function outgoing(map: LinkMap): Map<NodeId, Link[]> {
  const out = new Map<NodeId, Link[]>();
  for (const link of Object.values(map.links)) out.set(link.from, [...(out.get(link.from) ?? []), link]);
  if (map.kind !== "tree") return out;
  for (const [from, links] of out) {
    const rank = new Map(nextSteps(map, from).map((id, i) => [id, i]));
    links.sort((a, b) => (rank.get(a.to) ?? 0) - (rank.get(b.to) ?? 0));
  }
  return out;
}

/** Boxes in reading order: depth first from the start (a tree) or from
    each box nothing points to, then any box only reached round a loop. */
function readingOrder(map: LinkMap, out: ReadonlyMap<NodeId, readonly Link[]>): NodeId[] {
  const all = Object.keys(map.nodes) as NodeId[];
  const pointedTo = new Set(Object.values(map.links).map((l) => l.to));
  const start = map.kind === "tree" ? startOf(map) : null;
  const firsts = start ? [start] : all.filter((id) => !pointedTo.has(id));
  const order: NodeId[] = [];
  const seen = new Set<NodeId>();
  for (const first of [...firsts, ...all]) {
    const stack = [first];
    let id: NodeId | undefined;
    while ((id = stack.pop()) !== undefined) {
      if (seen.has(id) || !map.nodes[id]) continue;
      seen.add(id);
      order.push(id);
      const links = out.get(id) ?? [];
      for (let i = links.length - 1; i >= 0; i--) stack.push(links[i].to);
    }
  }
  return order;
}

export function toMermaid(map: LinkMap): string {
  const out = outgoing(map);
  const order = readingOrder(map, out);
  const ids = new Map(order.map((id, i) => [id, `n${i + 1}`]));

  const lines: string[] = [];
  if (!isUntitled(map.name)) lines.push("---", `title: ${JSON.stringify(map.name)}`, "---");
  lines.push(`flowchart ${map.direction === "TB" ? "TD" : "LR"}`);
  if (map.kind !== "tree") lines.push(CONNECTIONS_LINE);
  // A blank name still needs some text: Mermaid rejects empty quotes.
  for (const id of order) lines.push(`    ${ids.get(id)}["${escapeText(map.nodes[id].name) || " "}"]`);
  for (const id of order) {
    for (const link of out.get(id) ?? []) {
      const label = link.label ? `|"${escapeText(link.label)}"|` : "";
      lines.push(`    ${ids.get(id)} -->${label} ${ids.get(link.to)}`);
    }
  }
  for (const id of order) {
    const color = map.nodes[id].color;
    if (!color) continue;
    const hex = PALETTE_HEX[color];
    lines.push(`    style ${ids.get(id)} fill:${tint(hex, 0.22)},stroke:${hex}`);
  }
  for (const id of order) {
    const notes = map.nodes[id].notes;
    if (notes) lines.push(`    %% notes ${ids.get(id)} "${escapeText(notes)}"`);
  }
  for (const status of NODE_STATUSES) {
    const marked = order.filter((id) => map.nodes[id].status === status);
    if (marked.length === 0) continue;
    lines.push(`    classDef ${status} ${STATUS_STYLE[status]}`);
    lines.push(`    class ${marked.map((id) => ids.get(id)).join(",")} ${status}`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------- import

export type MermaidResult =
  | {
      readonly ok: true;
      /** New maps, fresh ids, every box at 0, 0 (to be tidied). */
      readonly maps: readonly LinkMap[];
      /** What couldn't come across, in words (empty when everything did). */
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly error: string };

class ImportError extends Error {}

interface Cursor {
  readonly s: string;
  i: number;
}

const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " " };

/** Undoes `escapeText`. Names and labels are trimmed; notes keep their
    spacing exactly (`trim: false`). */
function decodeText(raw: string, trim = true): string {
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/#(\w+);/g, (whole, name: string) => {
      if (/^\d+$/.test(name)) return String.fromCodePoint(Number(name));
      return ENTITIES[name] ?? whole;
    });
  return trim ? text.trim() : text;
}

function unquote(text: string): string {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

/** Bracket pairs for node shapes; longer openers first so `((` beats `(`. */
const SHAPES: readonly (readonly [string, string])[] = [
  ["((", "))"],
  ["([", "])"],
  ["[[", "]]"],
  ["[(", ")]"],
  ["{{", "}}"],
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
  [">", "]"],
];

const NODE_ID = /[\p{L}\p{N}_]+/uy;
const LINK_WITH_TEXT = /(?:--|==)\s+(.+?)\s+(?:-->|---|==>|===)|-\.\s+(.+?)\s+\.->/y;
const LINK_PLAIN = /(?:-\.+->|-{2,}>|={2,}>|-{3,}|={3,})(?:\|([^|]*)\|)?/y;

function skipSpace(c: Cursor) {
  while (c.i < c.s.length && /\s/.test(c.s[c.i])) c.i++;
}

function sticky(re: RegExp, c: Cursor): RegExpExecArray | null {
  re.lastIndex = c.i;
  return re.exec(c.s);
}

interface NodeRef {
  readonly id: string;
  readonly title: string | null;
  /** From the `id:::name` shorthand. */
  readonly className: string | null;
}

function parseNode(c: Cursor): NodeRef {
  const ref = parseNodeShape(c);
  const shorthand = sticky(CLASS_SHORTHAND, c);
  if (!shorthand) return { ...ref, className: null };
  c.i += shorthand[0].length;
  return { ...ref, className: shorthand[1] };
}

function parseNodeShape(c: Cursor): { id: string; title: string | null } {
  skipSpace(c);
  const match = sticky(NODE_ID, c);
  if (!match) throw new ImportError(`Couldn't read this part: “${c.s.slice(c.i, c.i + 20)}”`);
  c.i += match[0].length;
  const id = match[0];

  for (const [open, close] of SHAPES) {
    if (!c.s.startsWith(open, c.i)) continue;
    c.i += open.length;
    skipSpace(c);
    let raw: string;
    if (c.s[c.i] === '"') {
      const end = c.s.indexOf('"', c.i + 1);
      if (end < 0) throw new ImportError(`Unclosed quote in the text of “${id}”`);
      raw = c.s.slice(c.i + 1, end);
      c.i = end + 1;
      skipSpace(c);
      if (!c.s.startsWith(close, c.i)) throw new ImportError(`Missing “${close}” after the text of “${id}”`);
    } else {
      const end = c.s.indexOf(close, c.i);
      if (end < 0) throw new ImportError(`Missing “${close}” after the text of “${id}”`);
      raw = c.s.slice(c.i, end);
      c.i = end;
    }
    c.i += close.length;
    return { id, title: decodeText(raw) };
  }
  return { id, title: null };
}

function parseNodeList(c: Cursor): NodeRef[] {
  const list = [parseNode(c)];
  for (;;) {
    skipSpace(c);
    if (c.s[c.i] !== "&") return list;
    c.i++;
    list.push(parseNode(c));
  }
}

/** Splits on `;` and newlines, but not inside quotes. */
function splitStatements(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuote = false;
  for (const ch of text) {
    if (ch === '"') inQuote = !inQuote;
    if ((ch === "\n" || ch === ";") && !inQuote) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter((s) => s && !s.startsWith("%%"));
}

interface Edge {
  readonly source: string;
  readonly target: string;
  label: string;
}

interface Draft {
  readonly titles: Map<string, string>;
  readonly edges: Edge[];
  readonly colors: Map<string, PaletteColor>;
  readonly notes: Map<string, string>;
  readonly statuses: Map<string, NodeStatus>;
}

function parseStatement(statement: string, draft: Draft) {
  const c: Cursor = { s: statement, i: 0 };
  const remember = (nodes: NodeRef[]) => {
    for (const { id, title, className } of nodes) {
      if (title !== null) draft.titles.set(id, title);
      else if (!draft.titles.has(id)) draft.titles.set(id, id);
      const status = asStatus(className);
      if (status) draft.statuses.set(id, status);
    }
  };

  let from = parseNodeList(c);
  remember(from);
  for (;;) {
    skipSpace(c);
    if (c.i >= c.s.length) return;
    let label = "";
    const withText = sticky(LINK_WITH_TEXT, c);
    if (withText) {
      c.i += withText[0].length;
      label = decodeText(unquote(withText[1] ?? withText[2]));
    } else {
      const plain = sticky(LINK_PLAIN, c);
      if (!plain) throw new ImportError(`Couldn't read this part: “${c.s.slice(c.i, c.i + 20)}”`);
      c.i += plain[0].length;
      label = plain[1] ? decodeText(unquote(plain[1])) : "";
    }
    const to = parseNodeList(c);
    remember(to);
    for (const source of from) {
      for (const target of to) draft.edges.push({ source: source.id, target: target.id, label });
    }
    from = to;
  }
}

function colorFromStyle(css: string): PaletteColor | null {
  const stroke = /stroke:\s*(#[0-9a-f]{6})/i.exec(css)?.[1].toLowerCase();
  return PALETTE_COLORS.find((name) => PALETTE_HEX[name] === stroke) ?? null;
}

/** Mermaid's front matter (`---` ... `---` before the chart) and its
    `title:`, if any; the text after it. */
function frontMatter(text: string): { title: string | null; body: string } {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(text);
  if (!match) return { title: null, body: text };
  const raw = /^title:\s*(.+?)\s*$/m.exec(match[1])?.[1] ?? null;
  let title = raw;
  if (raw?.startsWith('"')) {
    try {
      title = JSON.parse(raw) as string;
    } catch {
      title = unquote(raw);
    }
  } else if (raw?.startsWith("'") && raw.endsWith("'")) title = raw.slice(1, -1);
  return { title: title && cleanName(title) ? cleanName(title) : null, body: text.slice(match[0].length) };
}

/**
 * Reads Mermaid flowchart text into new maps (see the top of this file).
 * `taken`: the names already in use, so an untitled map gets the next free
 * "Untitled map N".
 */
export function fromMermaid(text: string, page: Size, taken: Iterable<string> = []): MermaidResult {
  try {
    return { ok: true, ...parse(text, page, taken) };
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, error: error.message };
    throw error;
  }
}

function parse(text: string, page: Size, taken: Iterable<string>): { maps: LinkMap[]; warnings: string[] } {
  const { title, body } = frontMatter(text);
  // Comment lines come out first: they may hold notes (or Linkkit's
  // marker), and a stray quote in one must not throw off the quote
  // tracking of the statements after it.
  const notes = new Map<string, string>();
  let connections = false;
  const code = body
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("%%")) return true;
      const match = NOTES_LINE.exec(trimmed);
      if (match) notes.set(match[1], decodeText(match[2], false));
      if (trimmed === CONNECTIONS_LINE) connections = true;
      return false;
    })
    .join("\n");
  const statements = splitStatements(code);
  const header = /^(?:flowchart|graph)(?:\s+(TB|TD|BT|LR|RL))?$/i.exec(statements[0] ?? "");
  if (!header) {
    throw new ImportError("Only flowcharts are supported: the text should start with “flowchart TD” or “flowchart LR”.");
  }
  const direction = /^(LR|RL)$/i.test(header[1] ?? "") ? "LR" : "TB";

  const draft: Draft = { titles: new Map(), edges: [], colors: new Map(), notes, statuses: new Map() };
  for (const statement of statements.slice(1)) {
    const keyword = /^(\w+)\b/.exec(statement)?.[1]?.toLowerCase();
    if (keyword === "subgraph") throw new ImportError("Subgraphs aren't supported yet.");
    if (keyword === "style") {
      const parts = /^style\s+(\S+)\s+(.+)$/i.exec(statement);
      const color = parts && colorFromStyle(parts[2]);
      if (parts && color) draft.colors.set(parts[1], color);
    } else if (keyword === "class") {
      // `class a,b cut`: only the three status classes mean anything here.
      const parts = /^class\s+(\S+)\s+(\S+)$/i.exec(statement);
      const status = parts && asStatus(parts[2]);
      if (parts && status) for (const id of parts[1].split(",")) draft.statuses.set(id.trim(), status);
    } else if (
      keyword &&
      ["classdef", "linkstyle", "click", "direction", "end", "acctitle", "accdescr"].includes(keyword)
    ) {
      continue; // Styling and interaction: nothing a map keeps.
    } else parseStatement(statement, draft);
  }
  if (draft.titles.size === 0) throw new ImportError("No boxes found.");

  const warnings: string[] = [];
  const nameOf = (key: string) => `“${cleanName(draft.titles.get(key) ?? "") || key}”`;
  // A box can't point at itself, and two arrows the same way between the
  // same boxes are one (the first label found is kept).
  const edges: Edge[] = [];
  for (const edge of draft.edges) {
    if (edge.source === edge.target) {
      warnings.push(`${nameOf(edge.source)} pointed to itself; that arrow was left out.`);
      continue;
    }
    const twin = edges.find((e) => e.source === edge.source && e.target === edge.target);
    if (twin) twin.label ||= edge.label;
    else edges.push({ ...edge });
  }

  // Which boxes go into which map: everything into one map without tree
  // rules when the text says so (a Linkkit connections map); otherwise one
  // tree per separate group of boxes, and the groups that can't be a tree
  // together in one map without tree rules.
  const keys = [...draft.titles.keys()];
  const groups: { keys: string[]; kind: MapKind }[] = [];
  if (connections) groups.push({ keys, kind: "connections" });
  else {
    const loose: string[] = [];
    for (const group of separateGroups(keys, edges)) {
      if (isTree(group, edges)) groups.push({ keys: group, kind: "tree" });
      else loose.push(...group);
    }
    if (loose.length) groups.push({ keys: keys.filter((k) => loose.includes(k)), kind: "connections" });
  }

  const names = [...taken];
  const maps = groups.map(({ keys: group, kind }) => {
    const map = buildMap(group, kind, edges, draft, direction, page, warnings);
    const first = kind === "tree" ? startOf(map) : (Object.keys(map.nodes)[0] as NodeId | undefined);
    const boxName = first ? map.nodes[first].name : "";
    const name = groups.length === 1 && title ? title : boxName || numberedName(UNTITLED_MAP, names);
    names.push(name);
    return { ...map, name };
  });
  return { maps, warnings };
}

/** The boxes split into groups joined by arrows (either way), each in the
    order its boxes were first written. */
function separateGroups(keys: readonly string[], edges: readonly Edge[]): string[][] {
  const near = new Map<string, string[]>(keys.map((k) => [k, []]));
  for (const { source, target } of edges) {
    near.get(source)!.push(target);
    near.get(target)!.push(source);
  }
  const groupOf = new Map<string, number>();
  let count = 0;
  for (const key of keys) {
    if (groupOf.has(key)) continue;
    const stack = [key];
    groupOf.set(key, count);
    let k: string | undefined;
    while ((k = stack.pop()) !== undefined) {
      for (const n of near.get(k)!) {
        if (groupOf.has(n)) continue;
        groupOf.set(n, count);
        stack.push(n);
      }
    }
    count++;
  }
  const groups: string[][] = Array.from({ length: count }, () => []);
  for (const key of keys) groups[groupOf.get(key)!].push(key);
  return groups;
}

/** A group is a Linkkit tree when it has exactly one start (a box nothing
    points to) and no loop. A box with two ways in is fine. */
function isTree(group: readonly string[], edges: readonly Edge[]): boolean {
  const inGroup = new Set(group);
  const mine = edges.filter((e) => inGroup.has(e.source));
  const into = new Map<string, number>(group.map((k) => [k, 0]));
  for (const e of mine) into.set(e.target, into.get(e.target)! + 1);
  if (group.filter((k) => into.get(k) === 0).length !== 1) return false;
  // Peel off boxes nothing points to (Kahn's algorithm): a loop never peels.
  const queue = group.filter((k) => into.get(k) === 0);
  let peeled = 0;
  while (queue.length) {
    const k = queue.pop()!;
    peeled++;
    for (const e of mine) {
      if (e.source !== k) continue;
      into.set(e.target, into.get(e.target)! - 1);
      if (into.get(e.target) === 0) queue.push(e.target);
    }
  }
  return peeled === group.length;
}

function buildMap(
  group: readonly string[],
  kind: MapKind,
  edges: readonly Edge[],
  draft: Draft,
  direction: "TB" | "LR",
  page: Size,
  warnings: string[],
): LinkMap {
  const ids = new Map<string, NodeId>(group.map((k) => [k, createNodeId()]));
  const nodes: Record<NodeId, MapNode> = {};
  const links: Record<LinkId, Link> = {};
  const pointedTo = new Set(edges.filter((e) => ids.has(e.target)).map((e) => e.target));
  let statusesLeft = 0;
  for (const key of group) {
    const id = ids.get(key)!;
    const status = draft.statuses.get(key) ?? null;
    // Only a tree's boxes have a status, and never its start.
    const keeps = kind === "tree" && pointedTo.has(key);
    if (status && !keeps) statusesLeft++;
    const notes = draft.notes.get(key) ?? "";
    nodes[id] = {
      id,
      name: cleanName(draft.titles.get(key) ?? ""),
      x: 0,
      y: 0,
      color: draft.colors.get(key) ?? null,
      status: keeps ? status : null,
      ...(notes.trim() ? { notes } : {}),
    };
  }
  for (const edge of edges) {
    if (!ids.has(edge.source)) continue;
    const id = createLinkId();
    links[id] = { id, from: ids.get(edge.source)!, to: ids.get(edge.target)!, label: cleanName(edge.label) || DEFAULT_LINK_LABELS[kind] };
  }
  if (statusesLeft) {
    const where = kind === "tree" ? "a start box" : "a map without tree rules";
    warnings.push(`Keep / maybe / cut was left off ${statusesLeft === 1 ? "1 box" : `${statusesLeft} boxes`}: ${where} has none.`);
  }
  const map: LinkMap = { ...createMap(createMapId(), UNTITLED_MAP, page, kind), direction, nodes, links };
  return kind === "tree" ? { ...map, order: normalizeOrder(map) } : map;
}
