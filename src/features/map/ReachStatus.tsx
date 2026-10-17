import { matchTitle } from "../../domain/bracket";
import { REACH_MEANINGS, reachCounts } from "../../domain/reach";
import type { MapKind } from "../../domain/types";
import { useGallery } from "../../store/gallery";
import { useMapStore } from "../../store/mapStore";
import { selectFocus, selectReach } from "../../store/selectors";
import styles from "./ReachStatus.module.css";

/** What the status line says while nothing is selected. */
const HINTS: Record<MapKind, string> = {
  connections:
    "Click any box to see what it needs and what breaks without it. Double-click the paper to add a box; drag a box's dot onto another to connect them; click an arrow, then drag its ends to reconnect it; drag across the paper to select several.",
  tree: "Tree rules on. Click a box to see the way that leads to it and what comes after. Use + on a box (or drag its dot onto the paper) to add a child; drag the dot onto another box to give it a second parent; drag a box onto another (or between two), or an arrow's end onto a box, to move it there; drag across the paper to select several.",
  steps: "Steps: click a step to see what comes before and after it.",
  bracket: "Bracket: click a player to make them the winner of their match.",
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
  // A bracket's match goes by its players ("Ann v Bob"); the hovered one
  // while there is one, as the highlight shows it.
  const name = useMapStore((s) => {
    const focus = selectFocus(s);
    return !focus ? undefined : s.map.kind === "bracket" ? matchTitle(s.map, focus) : s.map.nodes[focus]?.name;
  });
  const picked = useMapStore((s) => s.group.length);
  // A first visit (the untouched starter example) or an empty map points
  // to the gallery, where the examples are: one click to another one.
  const offerTemplates = useMapStore((s) => s.starter === s.map.id || isEmpty(s.map.nodes));

  // A bracket's picked matches light their paths (see `selectReach`), so
  // they read like one selected match (the hovered one's name while there
  // is one); matches don't move, so no drag hint.
  const group = picked > 1 && kind === "bracket" && !name;
  if (picked > 1 && kind !== "bracket") {
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
      <span className={styles.who}>{group ? `${picked} matches selected` : name || "Untitled"}</span>
      <span className={styles.chip}>
        <span className={styles.swatch} data-kind="teal" />
        {words.tealWords(counts.teal)}
      </span>
      {words.orangeWords && (
        <span className={styles.chip}>
          <span className={styles.swatch} data-kind="orange" />
          {words.orangeWords(counts.orange)}
        </span>
      )}
    </>
  );
}

function isEmpty(record: object): boolean {
  for (const _ in record) return false;
  return true;
}
