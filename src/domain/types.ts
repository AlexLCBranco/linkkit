/**
 * The map's data model. Pure types: no React, no store.
 *
 * Normalised like Treekit: flat `Record<id, entity>` maps. A node never
 * lists its links and a link never contains its nodes, so lookups are O(1),
 * one box's component can re-render alone, and deletes are cheap.
 *
 * The model is deliberately generic -- boxes, arrows, a `kind` -- so a
 * future tree or flowchart is the same data with a different rule set
 * (`rules.ts`), not a different shape.
 */

type Brand<T, B extends string> = T & { readonly __brand: B };

export type MapId = Brand<string, "MapId">;
export type NodeId = Brand<string, "NodeId">;
export type LinkId = Brand<string, "LinkId">;

/** Which rule set a map follows: "connections" (anything may need
    anything, loops allowed) or "tree" (a decision tree: one start, each
    step leads on to the next, no loops). See rules.ts. */
export const MAP_KINDS = ["connections", "tree"] as const;
export type MapKind = (typeof MAP_KINDS)[number];

/** Fixed swatches, mirrored as `--palette-*` in styles/tokens.css. */
export const PALETTE_COLORS = [
  "slate",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
] as const;
export type PaletteColor = (typeof PALETTE_COLORS)[number];

/** Which way Tidy up lays a map out: "TB" top-down (a box above what it
    needs), "LR" left-right (a box to the left of what it needs). Treekit's
    two directions and names. */
export const LAYOUT_DIRECTIONS = ["TB", "LR"] as const;
export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number];

/** How long Tidy up makes the arrows: the pixels of bare arrow shown beside
    the widest label (see `arrowGap` in layout.ts), any whole number from
    `ARROW_LENGTH_RANGE.min` to `.max`. The presets are named points on that
    range; Medium is the length Tidy up used before there was a choice. */
export type ArrowLength = number;
export const ARROW_LENGTH_PRESETS = { short: 15, medium: 47, long: 103 } as const;
export type ArrowLengthPreset = keyof typeof ARROW_LENGTH_PRESETS;
export const ARROW_LENGTH_RANGE = { min: 0, max: 240 } as const;

/** The label an arrow gets when none is typed (or one is emptied), per
    kind. A connections arrow always says something ("needs"); a tree arrow
    has no label at first, and shows no pill. */
export const DEFAULT_LINK_LABELS: Readonly<Record<MapKind, string>> = { connections: "needs", tree: "" };

/** A tree box's verdict (Treekit's): keep it, maybe, or cut it. Only a
    box's own status is stored; "looks cut" (under a cut box) is worked out
    (see `status.ts`). Shared with Boardkit's lists and cards once the apps
    share a store. */
export const NODE_STATUSES = ["keep", "maybe", "cut"] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface MapNode {
  readonly id: NodeId;
  readonly name: string;
  /** The box's CENTRE on the page, in page pixels. Centre (not top-left)
      so a box stays put when renaming makes it wider or narrower. */
  readonly x: number;
  readonly y: number;
  /** `null` = the theme's default box style. */
  readonly color: PaletteColor | null;
  /** Trees only (`canSetStatus` in rules.ts): keep / maybe / cut, or
      `null` for none. Always `null` in a connections map. */
  readonly status: NodeStatus | null;
}

/** An arrow. In a connections map `from` needs `to` (A -> B reads "A
    needs B"); in a tree `from` leads to `to` (`from` is the earlier step). */
export interface Link {
  readonly id: LinkId;
  readonly from: NodeId;
  readonly to: NodeId;
  /** An emptied label goes back to the kind's default
      (`DEFAULT_LINK_LABELS`): "needs" in a connections map, none in a tree. */
  readonly label: string;
}

/** Each box's next steps in order, keyed by the box (see `domain/order.ts`).
    A box with no next steps has no entry. */
export type SiblingOrder = Readonly<Record<NodeId, readonly NodeId[]>>;

/** One whole map: everything that is saved and undone together. */
export interface LinkMap {
  readonly id: MapId;
  readonly name: string;
  readonly kind: MapKind;
  /** The page size the map was last tidied onto, in pixels. A record only:
      the canvas draws the page as the screen, or bigger where the boxes
      reach further (see domain/page.ts). */
  readonly page: Size;
  /** Which way Tidy up lays the map out. Saved with the map, and undoable:
      switching it re-tidies the boxes. */
  readonly direction: LayoutDirection;
  /** How long Tidy up makes the arrows. Saved and undoable like the
      direction: picking another re-tidies the boxes. */
  readonly arrowLength: ArrowLength;
  readonly nodes: Readonly<Record<NodeId, MapNode>>;
  readonly links: Readonly<Record<LinkId, Link>>;
  /** Trees only: each box's next steps in order, which Tidy up follows.
      Empty in a connections map (its order comes from Tidy up). */
  readonly order: SiblingOrder;
  /** Trees only: boxes that look cut are off the page (and out of Tidy
      up) instead of greyed out. Linkkit's own view of the map, never
      shared; saved and undoable, since it changes the layout. */
  readonly hideCut: boolean;
  /** Trees only: boxes whose branch is folded away (Treekit's collapse).
      Kept here, outside the boxes, so it stays Linkkit's own view of the
      map when boxes are shared (as Boardkit keeps `collapsedLists` outside
      its lists). Saved and undoable, since it changes the layout. */
  readonly collapsed: readonly NodeId[];
}
