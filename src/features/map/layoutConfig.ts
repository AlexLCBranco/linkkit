import type { ArrowOptions } from "../../domain/geometry";
import type { LabelOptions } from "../../domain/labels";
import type { LayoutOptions } from "../../domain/layout";
import type { PageInsets } from "../../domain/page";

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

/** Clear space kept between any box and the page's edges, with a little
    more at the bottom (the prototype's numbers; room for step 6's "More
    room" tab). */
export const PAGE_INSETS: PageInsets = { edge: 14, bottomExtra: 10 };

/** How far apart (each side of the middle) two arrows between the same
    boxes in opposite directions are drawn. */
export const TWIN_OFFSET = 7;

/** How far the pointer must travel before a press on a box becomes a drag
    rather than a click (the prototype's number). */
export const DRAG_THRESHOLD = 4;

/** "Add box" steps a new box this far aside (down-right) at a time while
    it would overlap another, and keeps this much clear space round it. */
export const ADD_SPOT = { step: 24, clearance: 8 };
