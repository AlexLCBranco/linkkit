import { MoveRight } from "lucide-react";
import { Popover } from "radix-ui";

import type { ArrowLength } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import alignStyles from "./AlignPanel.module.css";
import styles from "./ArrowLengthPanel.module.css";

const OPTIONS: { value: ArrowLength; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

/**
 * How long Tidy up makes the arrows. Picking one tidies the map with it at
 * once (the boxes glide), saved with the map as one undoable change, like
 * the Top-down / Left-right switch. Picking the one already chosen tidies
 * again, as "Tidy up" would. A panel rather than another switch in the
 * header, which has little room left on a phone; it looks like Align's.
 */
export function ArrowLengthPanel() {
  const arrowLength = useMapStore((s) => s.map.arrowLength);
  const requestTidy = useMapStore((s) => s.requestTidy);

  return (
    <Popover.Root>
      <Popover.Trigger className={`${alignStyles.trigger} ${styles.trigger}`} title="How long Tidy up makes the arrows">
        <MoveRight size={16} className={styles.icon} aria-hidden />
        <span className={styles.word}>Arrows</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={alignStyles.panel} align="start" sideOffset={6}>
          <div className={alignStyles.title}>Arrow length</div>
          <div className={styles.list} role="radiogroup" aria-label="Arrow length">
            {OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={arrowLength === value}
                title={`Tidy up with ${label.toLowerCase()} arrows`}
                className={styles.option}
                onClick={() => requestTidy({ arrowLength: value })}
              >
                <span className={styles.arrow} data-length={value} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
