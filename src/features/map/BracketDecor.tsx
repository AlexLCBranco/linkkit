import { Trophy } from "lucide-react";

import { champion, playerName } from "../../domain/bracket";
import { bracketDecor } from "../../domain/bracketLayout";
import type { Box } from "../../domain/geometry";
import type { NodeId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import styles from "./BracketDecor.module.css";
import { BRACKET_DECOR } from "./layoutConfig";

/**
 * A bracket's extras, drawn on the page round its matches (in page units,
 * on the canvas's sheet): each round's heading over its column ("Round 1"
 * … "Final"), and the Champion box right of the final, showing the
 * final's winner (a faint "—" until there is one). Placed from where the
 * matches are drawn, so they glide with them (`bracketDecor`). Nothing in
 * any other map. Rounds pinned from round `pinnedFrom` (0: none) carry their
 * headings with them.
 */
export function BracketDecor({ boxes, pinnedFrom }: { readonly boxes: ReadonlyMap<NodeId, Box>; readonly pinnedFrom: number }) {
  const map = useMapStore((s) => (s.map.kind === "bracket" ? s.map : null));
  if (!map) return null;
  const { headings, champion: spot } = bracketDecor(map, boxes, BRACKET_DECOR.gap, pinnedFrom);
  const name = playerName(map, champion(map));
  return (
    <>
      {headings.map((h) => (
        <div key={h.round} className={styles.heading} style={{ left: h.x, top: h.bottom }}>
          {h.text}
        </div>
      ))}
      {spot && (
        <div className={styles.champion} style={{ left: spot.left, top: spot.y }} data-won={name ? true : undefined}>
          <span className={styles.title}>
            <Trophy size={12} aria-hidden />
            Champion
          </span>
          <span className={styles.name} data-empty={!name || undefined}>
            {name || "—"}
          </span>
        </div>
      )}
    </>
  );
}
