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

/** Tidy up's options for an arrow length (the bare arrow shown beside the
    widest label, see `arrowGap`), in a direction, around these labels.
    Top-down, with the usual one-line labels, the presets make gaps of 56,
    88 (Tidy up's length before there was a choice) and 144. */
export function layoutOptions(length: ArrowLength, direction: LayoutDirection, labels: Iterable<Size>): LayoutOptions {
  const ends = 2 * ARROW.gap + ARROW.headLength;
  return { ...MAP_LAYOUT, rowGap: arrowGap(length, labels, direction, ends) };
}

/** One notch of the mouse wheel over the arrow length (deltaY 100 in most
    browsers) changes it by this many pixels. Trackpads send smaller
    deltas, so they change it smoothly. */
export const ARROW_WHEEL_STEP = 8;

/** Wheel turns this close together make one undo step. */
export const ARROW_WHEEL_PAUSE_MS = 600;

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

/** Dragging a tree box between siblings: how far past the first or last
    one a drop spot reaches, and the narrowest a gap's spot gets. */
export const DROP_SLOTS = { reach: 32, minGap: 24 };
