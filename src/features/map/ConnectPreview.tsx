import { linkGeometry, type Box } from "../../domain/geometry";
import type { NodeId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { ARROW } from "./layoutConfig";
import styles from "./ConnectPreview.module.css";

/** Where the pointer is, as a box with no size, so the same arrow maths
    reaches it. */
const pointAt = (center: Box["center"]): Box => ({ center, size: { width: 0, height: 0 } });

/**
 * The dashed arrow that follows the pointer while one is dragged out of a
 * box's dot (as in the prototype). Over a box it may connect to, it snaps
 * to that box, showing exactly the arrow letting go would draw.
 *
 * Drawn over the page, ignoring the mouse, so the box under the pointer
 * can still be found. Subscribes only to the gesture: the rest of the
 * canvas does not re-render as the pointer moves.
 */
export function ConnectPreview({ boxes }: { readonly boxes: ReadonlyMap<NodeId, Box> }) {
  const connecting = useMapStore((s) => s.connecting);
  if (!connecting) return null;
  const from = boxes.get(connecting.from);
  const to = (connecting.target && boxes.get(connecting.target)) || pointAt(connecting.at);
  const g = from ? linkGeometry(from, to, ARROW) : null;
  if (!g) return null;
  const [tip, left, right] = g.head;

  return (
    <svg className={styles.preview} aria-hidden>
      <path className={styles.line} d={`M${g.start.x} ${g.start.y}L${g.end.x} ${g.end.y}`} />
      <path className={styles.head} d={`M${tip.x} ${tip.y}L${left.x} ${left.y}L${right.x} ${right.y}Z`} />
    </svg>
  );
}
