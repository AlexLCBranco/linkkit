import { EyeOff } from "lucide-react";

import { cutCount } from "../../domain/status";
import { useMapStore } from "../../store/mapStore";
import styles from "./HideCutToggle.module.css";

/**
 * "Hide cut" (Treekit's): takes boxes that look cut off the page, and the
 * tree re-tidies around what's left, instead of showing them greyed out.
 * Saved with the map and an undo step, like the direction switch. While on,
 * it is the way back to a hidden branch, so it shows how many cut branches
 * there are. Only in trees: statuses are a decision tree's idea.
 */
export function HideCutToggle() {
  const isTree = useMapStore((s) => s.map.kind === "tree");
  const hideCut = useMapStore((s) => s.map.hideCut);
  const count = useMapStore((s) => cutCount(s.map));
  const setHideCut = useMapStore((s) => s.setHideCut);
  if (!isTree) return null;

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={hideCut}
      aria-label="Hide cut branches"
      onClick={() => setHideCut(!hideCut)}
      title={hideCut ? "Show cut branches (greyed out)" : "Hide cut branches"}
    >
      <EyeOff size={14} aria-hidden />
      {/* Short, so the header still fits the map's name. */}
      <span className={styles.word}>Hide cut</span>
      {count > 0 && <span className={styles.count}>{count}</span>}
    </button>
  );
}
