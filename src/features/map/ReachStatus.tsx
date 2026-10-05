import { reachCounts } from "../../domain/reach";
import { useMapStore } from "../../store/mapStore";
import { selectReach } from "../../store/selectors";
import styles from "./ReachStatus.module.css";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The status line's words: a hint while nothing is selected, otherwise the
 * selected box's name and its two counts, each with a swatch in its
 * highlight colour (as in the prototype).
 *
 * A box both needed and broken (in a loop) counts only under "Needs",
 * matching how it is drawn (see `reachCounts`).
 */
export function ReachStatus() {
  const reach = useMapStore(selectReach);
  const name = useMapStore((s) => (s.selected ? s.map.nodes[s.selected]?.name : undefined));

  if (!reach) {
    return <span className={styles.hint}>Click any box to see what it needs and what breaks without it.</span>;
  }
  const counts = reachCounts(reach);
  return (
    <>
      <span className={styles.who}>{name || "Untitled"}</span>
      <span className={styles.chip}>
        <span className={styles.swatch} data-kind="need" />
        Needs {plural(counts.needs, "thing", "things")}
      </span>
      <span className={styles.chip}>
        <span className={styles.swatch} data-kind="break" />
        {plural(counts.breaks, "thing breaks", "things break")} without it
      </span>
    </>
  );
}
