import { ArrowDown, ArrowRight, type LucideIcon } from "lucide-react";

import type { LayoutDirection } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import styles from "./DirectionToggle.module.css";

const OPTIONS: { value: LayoutDirection; label: string; Icon: LucideIcon }[] = [
  { value: "TB", label: "Top-down", Icon: ArrowDown },
  { value: "LR", label: "Left-right", Icon: ArrowRight },
];

/**
 * Treekit's direction switch: which way Tidy up lays the map out. Picking
 * the other one tidies the map in that direction (the boxes glide), saved
 * with the map as one undoable change.
 */
export function DirectionToggle() {
  const direction = useMapStore((s) => s.map.direction);
  const requestTidy = useMapStore((s) => s.requestTidy);

  return (
    <div className={styles.group} role="radiogroup" aria-label="Layout direction">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={direction === value}
          title={value === "TB" ? "Tidy up top-down: a box above what it needs" : "Tidy up left-right: a box left of what it needs"}
          className={styles.option}
          onClick={() => {
            if (value !== direction) requestTidy({ direction: value });
          }}
        >
          <Icon size={16} className={styles.icon} aria-hidden />
          <span className={styles.word}>{label}</span>
        </button>
      ))}
    </div>
  );
}
