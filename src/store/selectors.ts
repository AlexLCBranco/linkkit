import { linkHighlight, nodeHighlight, reachOf, type LinkHighlight, type NodeHighlight, type Reach } from "../domain/reach";
import type { LinkId, NodeId, PaletteColor } from "../domain/types";
import type { MapState } from "./mapStore";

/**
 * Derived values read from the store. Each box and arrow asks for its own
 * highlight -- a short string -- so a click re-renders only the boxes and
 * arrows whose look actually changes.
 */

// Every box and arrow asks at once after a click, so the reach is worked
// out once and reused until the map or the selection changes. One entry is
// enough: there is only one open map.
let cached: { map: MapState["map"]; selected: NodeId | null; reach: Reach | null } | null = null;

/** What the selected box needs and what breaks without it; `null` when
    nothing (or a box that no longer exists) is selected. */
export function selectReach(s: Pick<MapState, "map" | "selected">): Reach | null {
  if (cached?.map !== s.map || cached.selected !== s.selected) {
    cached = { map: s.map, selected: s.selected, reach: reachOf(s.map, s.selected) };
  }
  return cached.reach;
}

/** `null` while nothing is selected: the box looks as usual. */
export function selectNodeHighlight(s: Pick<MapState, "map" | "selected">, id: NodeId): NodeHighlight | null {
  const reach = selectReach(s);
  return reach && s.map.nodes[id] ? nodeHighlight(reach, id) : null;
}

/** `null` while nothing is selected: the arrow looks as usual. */
export function selectLinkHighlight(s: Pick<MapState, "map" | "selected">, id: LinkId): LinkHighlight | null {
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
