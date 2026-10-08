import { REACH_MEANINGS, reachCounts } from "../../domain/reach";
import type { MapKind } from "../../domain/types";
import { useGallery } from "../../store/gallery";
import { useMapStore } from "../../store/mapStore";
import { selectReach } from "../../store/selectors";
import styles from "./ReachStatus.module.css";

/** What the status line says while nothing is selected. */
const HINTS: Record<MapKind, string> = {
  connections:
    "Click any box to see what it needs and what breaks without it. Double-click the paper to add a box; drag a box's dot onto another to connect them; click an arrow, then drag its ends to reconnect it; drag across the paper to select several.",
  tree: "Tree rules on. Click a box to see the way that leads to it and what comes after. Use + on a box (or drag its dot onto the paper) to add a child; drag the dot onto another box to give it a second parent; drag a box onto another (or between two), or an arrow's end onto a box, to move it there; drag across the paper to select several.",
};

/** A tree linked to Boardkit: no second way in, and cards (level 3) take no
    next steps, so its hint leaves both out. */
const LINKED_HINT =
  "Tree rules on, shared with Boardkit. Click a box to see the way that leads to it and what comes after. Use + on the board or a list (or drag its dot onto the paper) to add a child: the board's children are lists in Boardkit, a list's are cards. Drag a card onto another list (or between two cards) to move it there; drag across the paper to select several.";

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
  const linked = useMapStore((s) => s.map.linkedBoard !== undefined);
  const name = useMapStore((s) => (s.selected ? s.map.nodes[s.selected]?.name : undefined));
  const picked = useMapStore((s) => s.group.length);
  // A first visit (the untouched starter example) or an empty map points
  // to the gallery, where the examples are: one click to another one.
  const offerTemplates = useMapStore((s) => s.starter === s.map.id || isEmpty(s.map.nodes));

  if (picked > 1) {
    return (
      <>
        <span className={styles.who}>{picked} boxes selected</span>
        <span className={styles.hint}>Drag any of them to move them together · Shift+click adds or removes a box</span>
      </>
    );
  }

  if (!reach) {
    return (
      <>
        <span className={styles.hint}>{linked ? LINKED_HINT : HINTS[kind]}</span>
        {offerTemplates && (
          <button type="button" className={styles.templates} onClick={() => useGallery.getState().setOpen(true)}>
            Start from a template or example…
          </button>
        )}
      </>
    );
  }
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

function isEmpty(record: object): boolean {
  for (const _ in record) return false;
  return true;
}
