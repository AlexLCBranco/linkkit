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

/** Which rule set a map follows. Only "connections" exists for now. */
export const MAP_KINDS = ["connections"] as const;
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

/** The word an arrow shows when its label is left empty. */
export const DEFAULT_LINK_LABEL = "needs";

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
}

/** An arrow: `from` needs `to` (A -> B reads "A needs B"). */
export interface Link {
  readonly id: LinkId;
  readonly from: NodeId;
  readonly to: NodeId;
  /** Never empty: an emptied label goes back to `DEFAULT_LINK_LABEL`. */
  readonly label: string;
}

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
  readonly nodes: Readonly<Record<NodeId, MapNode>>;
  readonly links: Readonly<Record<LinkId, Link>>;
}
