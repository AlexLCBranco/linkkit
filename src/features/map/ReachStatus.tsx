import { REACH_MEANINGS, reachCounts } from "../../domain/reach";
import type { MapKind } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { selectReach } from "../../store/selectors";
import styles from "./ReachStatus.module.css";

/** What the status line says while nothing is selected. */
const HINTS: Record<MapKind, string> = {
  connections:
    "Click any box to see what it needs and what breaks without it. Double-click the paper to add a box; drag a box's dot onto another to connect them; drag across the paper to select several.",
  tree: "Click a box to see the way that leads to it and what comes after. Use + on a box (or drag its dot onto the paper) to add a next step; drag the dot onto another box to give it a second way in; drag across the paper to select several.",
};

/**
 * The status line's words: a hint while nothing is selected, how many boxes
 * while several are picked, otherwise the selected box's name and its two
 * counts, each with a swatch in its
 * highlight colour (as in the prototype). The words for each count depend
 * on the map's kind (`REACH_MEANINGS`).
 *
 * A box in both groups (in a loop) counts only under teal, matching how it
 * is drawn (see `reachCounts`).
 */
export function ReachStatus() {
  const reach = useMapStore(selectReach);
  const kind = useMapStore((s) => s.map.kind);
  const name = useMapStore((s) => (s.selected ? s.map.nodes[s.selected]?.name : undefined));
  const picked = useMapStore((s) => s.group.length);

  if (picked > 1) {
    return (
      <>
        <span className={styles.who}>{picked} boxes selected</span>
        <span className={styles.hint}>Drag any of them to move them together · Shift+click adds or removes a box</span>
      </>
    );
  }

  if (!reach) return <span className={styles.hint}>{HINTS[kind]}</span>;
  const counts = reachCounts(reach);
  const words = REACH_MEANINGS[kind];
  return (
    <>
      <span className={styles.who}>{name || "Untitled"}</span>
      <span className={styles.chip}>
        <span className={styles.swatch} data-kind="teal" />
        {words.tealWords(counts.teal)}
      </span>
      <span className={styles.chip}>
        <span className={styles.swatch} data-kind="orange" />
        {words.orangeWords(counts.orange)}
      </span>
    </>
  );
}
