import { useMapStore } from "../../store/mapStore";
import styles from "./DropPreview.module.css";

/**
 * While a tree box is dragged over a place it could move to: the bar in the
 * gap between siblings, and a small chip beside the pointer saying what
 * letting go does ("Move under 'Buy'") or why it can't. The box it would
 * go under shows the target ring itself (BoxView).
 *
 * Drawn over the page, ignoring the mouse, so the drag can still find what
 * is under the pointer. Subscribes only to the gesture.
 */
export function DropPreview() {
  const dropping = useMapStore((s) => s.dropping);
  const parentName = useMapStore((s) => (s.dropping ? s.map.nodes[s.dropping.parent]?.name : undefined));
  if (!dropping) return null;
  const { bar, refusal, at, already } = dropping;

  return (
    <>
      {bar && (
        <svg className={styles.layer} aria-hidden>
          <line className={styles.bar} x1={bar.from.x} y1={bar.from.y} x2={bar.to.x} y2={bar.to.y} />
        </svg>
      )}
      <div className={styles.chip} data-refused={refusal ? true : undefined} data-already={already || undefined} style={{ left: at.x, top: at.y }} role="status">
        {refusal ?? (already ? `Already under “${parentName || "Untitled"}”` : `Move under “${parentName || "Untitled"}”`)}
      </div>
    </>
  );
}
