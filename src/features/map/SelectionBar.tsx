import { ChevronDown, Copy, CopyPlus, Trash2, X } from "lucide-react";
import type { CSSProperties } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { canDeleteBox, canPaste } from "../../domain/rules";
import { useMapStore } from "../../store/mapStore";
import { selectGroupColor } from "../../store/selectors";
import styles from "./SelectionBar.module.css";
import { SwatchRow } from "./SwatchRow";

/**
 * Actions for a marquee group, floating at the bottom of the map while two
 * or more boxes are picked (Treekit's selection bar, like Figma's): colour,
 * duplicate, copy, delete, each one undo step for the whole group, and ×
 * to let go. The same things the keys and the right-click menu do, made
 * visible so they can be found without knowing them. In a tree, Duplicate
 * and Copy are left out (`canPaste`: a pasted box would be loose).
 *
 * Subscribes to a small summary of the group (count, shared colour, what
 * may be done), so it re-renders only when that changes.
 */
export function SelectionBar() {
  const count = useMapStore((s) => s.group.length);
  const color = useMapStore(selectGroupColor);
  const pastable = useMapStore((s) => canPaste(s.map));
  const deletable = useMapStore((s) => s.group.some((id) => canDeleteBox(s.map, id)));
  if (count < 2) return null;

  const store = useMapStore.getState;
  // Read at click time, so an action always gets the group as it is now.
  const group = () => store().group;
  const swatch = color ? ({ "--swatch": `var(--palette-${color})` } as CSSProperties) : undefined;

  return (
    <div className={styles.bar} role="toolbar" aria-label="Selected boxes">
      <span className={styles.count}>{count} selected</span>
      <span className={styles.divider} aria-hidden />

      <DropdownMenu>
        <DropdownMenuTrigger className={styles.colorTrigger} aria-label="Colour" title="Colour (1–8, 0 clears)">
          <span
            className={styles.swatch}
            data-none={color === null || undefined}
            data-mixed={color === undefined || undefined}
            style={swatch}
            aria-hidden
          />
          <ChevronDown size={12} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-auto" side="top" align="center" sideOffset={8}>
          <SwatchRow value={color} onPick={(c) => store().setBoxesColor(group(), c)} Item={DropdownMenuItem} />
        </DropdownMenuContent>
      </DropdownMenu>

      {pastable && (
        <>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Duplicate"
            title="Duplicate (Ctrl+D)"
            onClick={() => store().duplicateBoxes(group())}
          >
            <CopyPlus size={16} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Copy"
            title="Copy (Ctrl+C), then right-click the paper to paste"
            onClick={() => store().copyBoxes(group())}
          >
            <Copy size={16} aria-hidden />
          </button>
        </>
      )}
      {deletable && (
        <button
          type="button"
          className={styles.iconButton}
          data-danger
          aria-label={`Delete ${count} boxes`}
          title={`Delete ${count} boxes (Del)`}
          onClick={() => store().deleteBoxes(group())}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      )}
      <span className={styles.divider} aria-hidden />

      <button
        type="button"
        className={styles.iconButton}
        aria-label="Clear selection"
        title="Clear selection (Esc)"
        onClick={() => store().select(null)}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
