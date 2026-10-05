import type { ArrowOptions } from "../../domain/geometry";
import type { LabelOptions } from "../../domain/labels";
import type { LayoutOptions } from "../../domain/layout";

/**
 * Numbers the pure layout and arrow geometry need as plain JS values (as in
 * Treekit's layoutConfig: CSS custom properties cannot reach `domain/`).
 * The fallback size roughly matches a one-line box; it is only used before
 * React Flow has measured a box.
 */
export const MAP_LAYOUT: LayoutOptions = {
  columnGap: 32,
  // Tall enough for crossing arrows' labels to sit apart between two rows.
  rowGap: 88,
  fallbackSize: { width: 120, height: 40 },
};

/** Clear space around a tidied map on the page (the prototype's numbers). */
export const PAGE_MARGIN = { x: 54, y: 64 };

/** Arrowhead shape and the gap between an arrow's ends and the boxes. */
export const ARROW: ArrowOptions = { gap: 5, headLength: 9, headWidth: 9 };

/** Where labels may slide along their arrow to stay clear of each other:
    the middle first, then a little either way. */
export const LABELS: LabelOptions = { spots: [0.5, 0.35, 0.65, 0.22, 0.78], padding: 2 };

/** A label's size before it has been measured ("needs"). */
export const LABEL_FALLBACK_SIZE = { width: 48, height: 22 };
