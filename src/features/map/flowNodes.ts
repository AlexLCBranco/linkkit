import type { NodeId, Point, Size } from "../../domain/types";
import type { BoxFlowNode } from "./BoxView";
import type { MatchFlowNode } from "./MatchBox";
import { MAP_LAYOUT } from "./layoutConfig";

const NO_DATA = {};

/**
 * React Flow's record for one box: where it is drawn (its centre) and the
 * size React Flow measured for it. Its own module so a test can check it.
 */
export function boxFlowNode(
  id: NodeId,
  at: Point,
  measured: Size | undefined,
  type: "box" | "match" = "box",
): BoxFlowNode | MatchFlowNode {
  return {
    id,
    // A bracket's boxes are matches (MatchBox).
    type,
    position: { x: at.x, y: at.y },
    data: NO_DATA,
    // Handing React Flow back the size it measured (normally done by
    // `applyNodeChanges`): these node objects are rebuilt every render,
    // and without it React Flow forgets the measurement -- and with it
    // the arrows, which need it.
    measured,
    // Until measured, React Flow hides a node. A typical box's size keeps
    // a new box visible, so its name field takes focus at once (Treekit's).
    // Not a match: React Flow draws a node that size until measured, so a
    // bracket's first tidy would lay out every match at it. All of a
    // bracket's matches come at once, before its first tidy.
    ...(type === "box" ? { initialWidth: MAP_LAYOUT.fallbackSize.width, initialHeight: MAP_LAYOUT.fallbackSize.height } : {}),
  };
}
