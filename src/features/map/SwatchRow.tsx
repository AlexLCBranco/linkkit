import type { ComponentType, CSSProperties, ReactNode } from "react";

import { PALETTE_COLORS, type PaletteColor } from "../../domain/types";
import styles from "./SwatchRow.module.css";

/** The menu item each swatch is drawn as: the right-click menu's or the
    toolbar dropdown's, so the row behaves like any other item in its menu
    (arrow keys move between swatches, a pick closes the menu). */
type ItemComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
  title?: string;
  "aria-label"?: string;
  "data-current"?: boolean;
  "data-none"?: boolean;
  onSelect?: () => void;
  children?: ReactNode;
}>;

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * A box's colours as one row of dots: "none" first, then the 8 palette
 * colours in key order (0, then 1-8). The box's current colour is ringed.
 * A row of dots instead of Treekit's 9-line list: a colour is picked by
 * eye, and the row keeps the menu short.
 */
export function SwatchRow({
  value,
  onPick,
  Item,
}: {
  readonly value: PaletteColor | null;
  readonly onPick: (color: PaletteColor | null) => void;
  readonly Item: ItemComponent;
}) {
  return (
    <div className={styles.row}>
      <Item
        className={styles.swatch}
        data-none
        data-current={value === null || undefined}
        title="No colour (0)"
        aria-label="No colour"
        onSelect={() => onPick(null)}
      />
      {PALETTE_COLORS.map((color, index) => (
        <Item
          key={color}
          className={styles.swatch}
          style={{ "--swatch": `var(--palette-${color})` } as CSSProperties}
          data-current={value === color || undefined}
          title={`${capitalise(color)} (${index + 1})`}
          aria-label={capitalise(color)}
          onSelect={() => onPick(color)}
        />
      ))}
    </div>
  );
}
