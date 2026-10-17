import { linkHighlight, nodeHighlight, reachOf, type LinkHighlight, type NodeHighlight, type Reach } from "../domain/reach";
import { shownMap } from "../domain/shown";
import { canSetStatus } from "../domain/rules";
import { parallelJoins, stepNumbers } from "../domain/steps";
import type { Slot } from "../domain/bracket";
import type { LinkId, NodeId, NodeStatus, PaletteColor } from "../domain/types";
import type { MapState } from "./mapStore";

/**
 * Derived values read from the store. Each box and arrow asks for its own
 * highlight -- a short string -- so a click re-renders only the boxes and
 * arrows whose look actually changes.
 */

// Every box and arrow asks at once after a click, so the reach is worked
// out once and reused until the map or the selection changes. One entry is
// enough: there is only one open map.
let cached: { map: MapState["map"]; key: string; reach: Reach | null } | null = null;

/** What the highlight reads from: the selection, and a bracket's hovered
    match (and row) and picked group (optional, so a caller without them
    sees only the selection). */
type HighlightState = Pick<MapState, "map" | "selected"> & {
  readonly hovered?: NodeId | null;
  readonly hoveredSlot?: Slot | null;
  readonly group?: readonly NodeId[];
};

/** The boxes the highlight starts from: the focus, else, in a bracket, every
    match the marquee picked (owner's call, 2026-10-16: their past paths all
    light up). Other kinds light nothing for a group. */
function highlightFrom(s: HighlightState): readonly NodeId[] {
  const focus = selectFocus(s);
  if (focus) return [focus];
  return s.map.kind === "bracket" ? (s.group ?? []) : [];
}

/** The row under the mouse while the hovered match is the focus: only its
    player's path lights (owner's call, 2026-10-17). */
function focusSlot(s: HighlightState): Slot | null {
  const focus = selectFocus(s);
  return focus !== null && focus === s.hovered ? (s.hoveredSlot ?? null) : null;
}

/** The box whose highlight shows: in a bracket, the match under the mouse
    while there is one (owner's call, 2026-10-16), else the selected box. */
export function selectFocus(s: HighlightState): NodeId | null {
  const { hovered } = s;
  return s.map.kind === "bracket" && hovered && s.map.nodes[hovered] ? hovered : s.selected;
}

/** What the focused box needs and what breaks without it; `null` when
    nothing (or a box that no longer exists) is focused. */
export function selectReach(s: HighlightState): Reach | null {
  const from = highlightFrom(s);
  const slot = focusSlot(s);
  // By the ids, not the array: the marquee hands over a new one each move.
  const key = `${from.join(" ")}:${slot}`;
  if (cached?.map !== s.map || cached.key !== key) {
    // Walked on the map as it shows: with "hide cut" on, hidden boxes are
    // neither lit nor counted.
    cached = { map: s.map, key, reach: reachOf(shownMap(s.map), from, slot) };
  }
  return cached.reach;
}

/** `null` while nothing is selected or hovered: the box looks as usual. The
    selected box (or picked group) keeps its ring while another match is
    hovered; the hovered one shows as the end of its own path (teal). */
export function selectNodeHighlight(s: HighlightState, id: NodeId): NodeHighlight | null {
  const reach = selectReach(s);
  if (!reach || !s.map.nodes[id]) return null;
  if (id === s.selected || s.group?.includes(id)) return "selected";
  return id === reach.selected ? "teal" : nodeHighlight(reach, id);
}

/** `null` while nothing is selected or hovered: the arrow looks as usual. */
export function selectLinkHighlight(s: HighlightState, id: LinkId): LinkHighlight | null {
  const reach = selectReach(s);
  const link = s.map.links[id];
  return reach && link ? linkHighlight(reach, link) : null;
}

/** The picked group's colour if every box in it shares one (`null`: none),
    else `undefined` (mixed). */
export function selectGroupColor(s: Pick<MapState, "map" | "group">): PaletteColor | null | undefined {
  const colors = new Set(s.group.map((id) => s.map.nodes[id]?.color ?? null));
  return colors.size === 1 ? [...colors][0] : undefined;
}

/** The status every picked box that may have one shares (`null`: none),
    else `undefined` (mixed). The start, which has none, doesn't count. */
export function selectGroupStatus(s: Pick<MapState, "map" | "group">): NodeStatus | null | undefined {
  const statuses = new Set(s.group.filter((id) => canSetStatus(s.map, id)).map((id) => s.map.nodes[id].status));
  return statuses.size === 1 ? [...statuses][0] : undefined;
}

// Every box asks whether it offers "Join here" or is a Parallel's join:
// worked out once per map.
let paralleled: { map: MapState["map"]; marks: ReturnType<typeof parallelJoins> } | null = null;
const parallelMarks = (map: MapState["map"]) => {
  if (paralleled?.map !== map) paralleled = { map, marks: parallelJoins(map) };
  return paralleled.marks;
};

/** Steps: whether this step is an open end of a Parallel's branch, so it
    offers "Join here". */
export const selectOffersJoin = (s: Pick<MapState, "map">, id: NodeId): boolean =>
  s.map.kind === "steps" && parallelMarks(s.map).offers.has(id);

/** Steps: whether a Parallel's branches meet at this step (drawn with a bar
    on its top edge, as the Parallel has one on its bottom edge). */
export const selectIsParallelJoin = (s: Pick<MapState, "map">, id: NodeId): boolean =>
  s.map.kind === "steps" && parallelMarks(s.map).joins.has(id);

// Every box asks for its number after each edit: worked out once per map.
let numbered: { map: MapState["map"]; numbers: ReadonlyMap<NodeId, string> } | null = null;

/** A step's number in a Steps map ("3a.1"), or `null`: not a Steps map,
    numbers hidden, or a step not reached from the start. */
export function selectStepNumber(s: Pick<MapState, "map">, id: NodeId): string | null {
  if (s.map.kind !== "steps" || s.map.hideNumbers) return null;
  if (numbered?.map !== s.map) numbered = { map: s.map, numbers: stepNumbers(s.map) };
  return numbered.numbers.get(id) ?? null;
}
