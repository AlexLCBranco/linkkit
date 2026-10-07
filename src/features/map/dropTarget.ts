import { dropSlotAt, mostCovered, type SiblingRow } from "../../domain/drop";
import type { Box } from "../../domain/geometry";
import { nextSteps } from "../../domain/order";
import { canMove, moveRefusalText } from "../../domain/rules";
import { shownMap } from "../../domain/shown";
import { moveToParent } from "../../domain/tree";
import type { LinkMap, NodeId, Point, Size } from "../../domain/types";
import type { Dropping } from "../../store/mapStore";
import { DROP_SLOTS, MAP_LAYOUT } from "./layoutConfig";
import { BOX_ID_ATTRIBUTE } from "./pageMarkers";

/**
 * Where letting go of the tree box `id` would move it, with the pointer at
 * `client` (screen) / `at` (page): onto another box (that box's last next
 * step) or into a gap between siblings. `null` over bare paper, and over a
 * gap where it would change nothing: letting go there just moves the box
 * on the page, as before. Over the box it is already under, `already`:
 * letting go puts it back.
 *
 * The box under the pointer counts; with none there, the box the dragged
 * box mostly covers (`dragged`, its place now), since that is the box it
 * looks dropped on. Over a box the rules refuse, the answer carries the
 * reason (the chip shows it). Gaps are offered only where the box may go, so refused ones
 * never draw a bar.
 */
export function dropTargetAt(
  map: LinkMap,
  id: NodeId,
  client: Point,
  at: Point,
  sizes: ReadonlyMap<NodeId, Size>,
  dragged?: Box,
): Dropping | null {
  if (map.kind !== "tree") return null;
  const changes = (parent: NodeId, before: NodeId | null) => moveToParent(map, id, parent, before) !== map;

  // The dragged box itself is under the pointer: look through it.
  const hit = document
    .elementsFromPoint(client.x, client.y)
    .map((el) => el.closest(`[${BOX_ID_ATTRIBUTE}]`)?.getAttribute(BOX_ID_ATTRIBUTE) as NodeId | undefined)
    .find((box) => box && box !== id && map.nodes[box]) ?? (dragged ? coveredBy(map, id, dragged, sizes) : null);
  if (hit) {
    const verdict = canMove(map, id, hit);
    // Already under it: letting go puts the box back, and the chip says so.
    if (verdict.ok && !changes(hit, null)) return { box: id, at, parent: hit, before: null, bar: null, refusal: null, already: true };
    const refusal = verdict.ok ? null : moveRefusalText(map, id, hit, verdict.reason);
    return { box: id, at, parent: hit, before: null, bar: null, refusal };
  }

  const shown = shownMap(map);
  const rows: SiblingRow[] = [];
  for (const parent of Object.keys(shown.nodes) as NodeId[]) {
    const siblings = nextSteps(shown, parent).filter((c) => c !== id);
    if (siblings.length === 0 || !canMove(map, id, parent).ok) continue;
    rows.push({
      parent,
      siblings: siblings.map((c) => ({
        id: c,
        box: { center: shown.nodes[c], size: sizes.get(c) ?? MAP_LAYOUT.fallbackSize },
      })),
    });
  }
  const slot = dropSlotAt(at, rows, map.direction, DROP_SLOTS);
  if (!slot || !changes(slot.parent, slot.before)) return null;
  return { box: id, at, parent: slot.parent, before: slot.before, bar: slot.bar, refusal: null };
}

/** How much of the smaller box the dragged one must cover to count as
    dropped on it. */
const COVER_SHARE = 0.35;

function coveredBy(map: LinkMap, id: NodeId, dragged: Box, sizes: ReadonlyMap<NodeId, Size>): NodeId | null {
  const shown = shownMap(map);
  const others = Object.values(shown.nodes)
    .filter((n) => n.id !== id)
    .map((n) => [n.id, { center: { x: n.x, y: n.y }, size: sizes.get(n.id) ?? MAP_LAYOUT.fallbackSize }] as const);
  return mostCovered(dragged, others, COVER_SHARE);
}
