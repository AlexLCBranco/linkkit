import { dropSlotAt, type SiblingRow } from "../../domain/drop";
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
 * place where it would change nothing: letting go there just moves the box
 * on the page, as before.
 *
 * Over a box the rules refuse, the answer carries the reason (the chip
 * shows it). Gaps are offered only where the box may go, so refused ones
 * never draw a bar.
 */
export function dropTargetAt(
  map: LinkMap,
  id: NodeId,
  client: Point,
  at: Point,
  sizes: ReadonlyMap<NodeId, Size>,
): Dropping | null {
  if (map.kind !== "tree") return null;
  const changes = (parent: NodeId, before: NodeId | null) => moveToParent(map, id, parent, before) !== map;

  // The dragged box itself is under the pointer: look through it.
  const hit = document
    .elementsFromPoint(client.x, client.y)
    .map((el) => el.closest(`[${BOX_ID_ATTRIBUTE}]`)?.getAttribute(BOX_ID_ATTRIBUTE) as NodeId | undefined)
    .find((box) => box && box !== id && map.nodes[box]);
  if (hit) {
    const verdict = canMove(map, id, hit);
    if (verdict.ok && !changes(hit, null)) return null;
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
