import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  type LucideIcon,
} from "lucide-react";
import { Popover } from "radix-ui";

import type { Align } from "../../domain/page";
import { useViewStore } from "../../store/viewStore";
import styles from "./AlignPanel.module.css";

const ROWS: { axis: "x" | "y"; options: { value: Align; label: string; Icon: LucideIcon }[] }[] = [
  {
    axis: "x",
    options: [
      { value: "start", label: "Align left", Icon: AlignHorizontalJustifyStart },
      { value: "center", label: "Align centre horizontally", Icon: AlignHorizontalJustifyCenter },
      { value: "end", label: "Align right", Icon: AlignHorizontalJustifyEnd },
    ],
  },
  {
    axis: "y",
    options: [
      { value: "start", label: "Align top", Icon: AlignVerticalJustifyStart },
      { value: "center", label: "Align middle", Icon: AlignVerticalJustifyCenter },
      { value: "end", label: "Align bottom", Icon: AlignVerticalJustifyEnd },
    ],
  },
];

/**
 * Treekit's Align panel: where the whole map sits on the screen. Top row:
 * flush left / centred / flush right; bottom row: top / middle / bottom.
 * The boxes glide there together, keeping their shape. Treekit moves its
 * camera instead; Linkkit's camera is locked, so the boxes move (one undo
 * step). Tidy up then places the map at the same spot.
 */
export function AlignPanel() {
  const alignment = useViewStore((s) => s.alignment);
  const setAlign = useViewStore((s) => s.setAlign);

  return (
    <Popover.Root>
      <Popover.Trigger className={styles.trigger} title="Move the whole map on the screen">
        <AlignHorizontalJustifyCenter size={16} className={styles.icon} aria-hidden />
        <span className={styles.word}>Align</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.panel} align="start" sideOffset={6}>
          <div className={styles.title}>Align</div>
          {ROWS.map(({ axis, options }) => (
            <div key={axis} className={styles.row} role="radiogroup" aria-label={axis === "x" ? "Horizontal" : "Vertical"}>
              {options.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={alignment[axis] === value}
                  aria-label={label}
                  title={label}
                  className={styles.option}
                  onClick={() => setAlign(axis, value)}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
