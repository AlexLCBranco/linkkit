import type { ArrowOptions } from "../../domain/geometry";
import type { LabelOptions } from "../../domain/labels";
import { arrowGap, type LayoutOptions } from "../../domain/layout";
import type { PageInsets } from "../../domain/page";
import type { ArrowLength, LayoutDirection, Size } from "../../domain/types";

/**
 * Numbers the pure layout and arrow geometry need as plain JS values (as in
 * Treekit's layoutConfig: CSS custom properties cannot reach `domain/`).
 * The fallback size roughly matches a one-line box; it is only used before
 * React Flow has measured a box.
 */
export const MAP_LAYOUT: LayoutOptions = {
  columnGap: 32,
  // Medium arrows top-down: tall enough for crossing arrows' labels to sit
  // apart between two rows. Tidy up works its own out (`layoutOptions`).
  rowGap: 88,
  fallbackSize: { width: 120, height: 40 },
};

/** How much bare arrow each arrow length shows beside its label (see
    `arrowGap`). Top-down, with the usual one-line labels, this makes gaps
    of 56, 88 (Tidy up's length before there was a choice) and 144. */
export const ARROW_LENGTH_EXTRA: Record<ArrowLength, number> = { short: 15, medium: 47, long: 103 };

/** Tidy up's options for an arrow length, in a direction, around these
    labels. */
export function layoutOptions(length: ArrowLength, direction: LayoutDirection, labels: Iterable<Size>): LayoutOptions {
  const ends = 2 * ARROW.gap + ARROW.headLength;
  return { ...MAP_LAYOUT, rowGap: arrowGap(ARROW_LENGTH_EXTRA[length], labels, direction, ends) };
}

/** Clear space around a tidied map on the page (the prototype's numbers). */
export const PAGE_MARGIN = { x: 54, y: 64 };

/** Arrowhead shape and the gap between an arrow's ends and the boxes. */
export const ARROW: ArrowOptions = { gap: 5, headLength: 9, headWidth: 9 };

/** Where labels may slide along their arrow to stay clear of each other:
    the middle first, then a little either way. */
export const LABELS: LabelOptions = { spots: [0.5, 0.35, 0.65, 0.22, 0.78], padding: 2 };

/** A label's size before it has been measured ("needs"). */
export const LABEL_FALLBACK_SIZE = { width: 48, height: 22 };

/** Clear space kept between any box and the page's edges (the prototype's
    number). */
export const PAGE_INSETS: PageInsets = { edge: 14 };

/** How far apart (each side of the middle) two arrows between the same
    boxes in opposite directions are drawn. */
export const TWIN_OFFSET = 7;

/** How far the pointer must travel before a press on a box becomes a drag
    rather than a click (the prototype's number). */
export const DRAG_THRESHOLD = 4;

/** "Add box" steps a new box this far aside (down-right) at a time while
    it would overlap another, and keeps this much clear space round it. */
export const ADD_SPOT = { step: 24, clearance: 8 };

/** How long Tidy up's glide takes (Treekit's glide length). */
export const TIDY_GLIDE_MS = 220;
