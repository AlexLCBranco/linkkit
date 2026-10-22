import type { RouteOptions } from "../../domain/arrows";
import type { ArrowOptions } from "../../domain/geometry";
import type { LabelOptions } from "../../domain/labels";
import { arrowGap, type LayoutOptions } from "../../domain/layout";
import type { PageInsets } from "../../domain/page";
import { ARROW_LENGTH_PRESETS, type ArrowLength, hasTreeShape, type LayoutDirection, type LinkId, type MapKind, type Size } from "../../domain/types";

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
export function layoutOptions(
  length: ArrowLength,
  direction: LayoutDirection,
  labels: ReadonlyMap<LinkId, Size>,
  kind: MapKind = "connections",
): LayoutOptions {
  if (hasTreeShape(kind)) {
    // Treekit's gap at Medium, each row's labels on top (`layoutTree`,
    // and a Steps map's `layoutSteps`).
    const rowGap = Math.max(ROUTES.elbow.minGap, TREE_ROW_GAP + length - ARROW_LENGTH_PRESETS.medium);
    return { ...MAP_LAYOUT, rowGap, labelSizes: labels };
  }
  const ends = 2 * ARROW.gap + ARROW.headLength;
  // A bracket: room for its round headings and Champion box (no labels).
  if (kind === "bracket") return { ...MAP_LAYOUT, rowGap: ends + length, bracketRoom: BRACKET_ROOM };
  return { ...MAP_LAYOUT, rowGap: arrowGap(length, labels.values(), direction, ends) };
}

/** A tree's gap between rows at Medium arrows, before labels: Treekit's
    `rankGap`. Short and Long move it as much as they move a map's
    (32 and 120). */
export const TREE_ROW_GAP = 64;

/** A bracket's extras round its matches: how far the round headings and
    the Champion box keep from them, a heading's height, and the Champion
    box's width (`--champion-width` in tokens.css). `pageTop` is the clear
    space over the headings and left of round 1 (owner: one paper dot,
    `--page-dot-gap`), in place of the page's usual margins. */
export const BRACKET_DECOR = { gap: 16, headingHeight: 20, championWidth: 140, pageTop: 24 };

/** Clear space around a tidied map on the page (the prototype's numbers). */
export const PAGE_MARGIN = { x: 54, y: 64 };

const BRACKET_ROOM = {
  // Less than the headings need when the page margin is wider than
  // `pageTop`: the margin then makes up the rest.
  above: BRACKET_DECOR.gap + BRACKET_DECOR.headingHeight + BRACKET_DECOR.pageTop - PAGE_MARGIN.y,
  // One dot left of round 1, the same way.
  left: BRACKET_DECOR.pageTop - PAGE_MARGIN.x,
  right: BRACKET_DECOR.gap + BRACKET_DECOR.championWidth,
};

/** A bracket's pinned later rounds keep this far below the screen's top
    edge: room for their headings over them (`pinnedRounds`). */
export const BRACKET_PIN_ABOVE = BRACKET_DECOR.gap + BRACKET_DECOR.headingHeight + BRACKET_DECOR.pageTop;

/** One notch of the mouse wheel over the arrow length (deltaY 100 in most
    browsers) changes it by this many pixels. Trackpads send smaller
    deltas, so they change it smoothly. */
export const ARROW_WHEEL_STEP = 8;

/** Wheel turns this close together make one undo step. */
export const ARROW_WHEEL_PAUSE_MS = 600;

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

/** On the gauntlet whiteboard: the room shown round a map's boxes, and how
    big an empty map shows (`contentBox`): just big enough for its hint. */
export const WHITEBOARD_CONTENT = {
  margin: 16,
  empty: { width: 260, height: 48 },
};

/** On the gauntlet whiteboard, a box added by a double-click anywhere on
    the page (`addBoxNear`): a typical box, kept clear of the others, at
    the nearest free spot looked for in rings 12 px apart. */
export const WHITEBOARD_ADD = {
  size: MAP_LAYOUT.fallbackSize,
  edge: PAGE_INSETS.edge,
  clearance: 12,
  step: 12,
  reach: 600,
};

/** How far apart (each side of the middle) two arrows between the same
    boxes in opposite directions are drawn. */
export const TWIN_OFFSET = 7;

/** How far the pointer must travel before a press on a box becomes a drag
    rather than a click (the prototype's number). */
export const DRAG_THRESHOLD = 4;
/** Clear space kept round the selected box when the screen scrolls to
    show it (Treekit's: half its frame margin). */
export const REVEAL_MARGIN = 36;

/** "Add box" steps a new box this far aside (down-right) at a time while
    it would overlap another, and keeps this much clear space round it. */
export const ADD_SPOT = { step: 24, clearance: 8 };

/** How long Tidy up's glide takes (Treekit's glide length). */
export const TIDY_GLIDE_MS = 220;

/** Dragging a tree box between siblings: how far past the first or last
    one a drop spot reaches, and the narrowest a gap's spot gets. */
export const DROP_SLOTS = { reach: 32, minGap: 24 };

/** An outline pasted into a map without tree rules: how far from the box
    pasted into its block of new boxes starts, how far it steps out while
    that spot is taken, and the clear space kept round other boxes. */
export const PASTE_BLOCK = { gap: 48, step: 24, clearance: 16 };

/** A template's thumbnail ("New from template"): every box drawn this size
    and this round, the gaps between them, and the margin round the whole. */
export const TEMPLATE_THUMB = { box: { width: 90, height: 34 }, radius: 8, rowGap: 40, columnGap: 18, padding: 12 };

/** Everything arrow routes need (`domain/arrows.ts`). The elbow numbers
    are Treekit's where it has one: its lines' corner rounding is 10. */
export const ROUTES: RouteOptions = {
  arrow: ARROW,
  twinOffset: TWIN_OFFSET,
  elbow: { corner: 10, minGap: 16, entrySpread: 14, lane: 24, sideGap: 32, stagger: 8 },
};

/** A picked arrow's round end handles (dragged to reconnect it): their
    radius, and how far each sits back along the line from the box it
    touches, so the box doesn't cover it. */
export const LINK_HANDLE_RADIUS = 6;
export const LINK_HANDLE_INSET = 9;
