import { matchGrid, matchOf, roundNames } from "./bracket";
import type { Box } from "./geometry";
import type { Bounds, LayoutOptions, MapLayout } from "./layout";
import type { LinkMap, NodeId, Point, Size } from "./types";

/**
 * A bracket's Tidy up (owner's spec): round 1 is the left column and the
 * final the right one; each match sits halfway between the two matches
 * that feed it. Always left to right, whatever the map's direction.
 *
 * Across the arrows (down the page) the first round's matches stack
 * `columnGap` apart, each one slot as tall as the tallest match, so every
 * later round lands exactly between its feeders and nothing can overlap.
 * Along the arrows each round is a column as wide as its widest match,
 * `rowGap` (the arrow length) after the one before, as in every map.
 *
 * `room` keeps space round the matches for what the page draws beside
 * them (the round headings above, the Champion box right of the final),
 * so a tidied bracket never pushes them off the page.
 */

/** Space the bracket's extras take: above the top match, right of the
    final. `left` is added left of round 1 (negative: less than the page
    margin). */
export interface BracketRoom {
  readonly above: number;
  readonly left?: number;
  readonly right: number;
}

export function layoutBracket(
  map: LinkMap,
  sizes: ReadonlyMap<NodeId, Size>,
  options: LayoutOptions,
  room: BracketRoom = { above: 0, right: 0 },
): MapLayout {
  const { columnGap, rowGap, fallbackSize } = options;
  const sizeOf = (id: NodeId) => sizes.get(id) ?? fallbackSize;
  const grid = matchGrid(map);
  const positions = new Map<NodeId, Point>();
  if (grid.length === 0) return { positions, bounds: { left: 0, top: 0, right: 0, bottom: 0 }, loopLinks: new Set() };

  const slot = Math.max(...grid.flat().map((id) => sizeOf(id).height)) + columnGap;
  let left = 0;
  for (const [r, column] of grid.entries()) {
    const width = Math.max(...column.map((id) => sizeOf(id).width));
    const x = left + width / 2;
    column.forEach((id, i) => {
      const y =
        r === 0
          ? slot / 2 + i * slot
          : (positions.get(grid[r - 1][2 * i])!.y + positions.get(grid[r - 1][2 * i + 1])!.y) / 2;
      positions.set(id, { x, y });
    });
    left += width + rowGap;
  }
  const right = left - rowGap;
  const top = columnGap / 2;
  const bottom = grid[0].length * slot - columnGap / 2;
  const bounds: Bounds = { left: 0 - (room.left ?? 0), top: top - room.above, right: right + room.right, bottom };
  return { positions, bounds, loopLinks: new Set() };
}

/** A round's heading: its name, centred over its column, its bottom edge at `bottom`. */
export interface RoundHeading {
  readonly round: number;
  readonly text: string;
  readonly x: number;
  readonly bottom: number;
}

/** Where the page draws the bracket's extras, from where its matches are now. */
export interface BracketDecor {
  readonly headings: readonly RoundHeading[];
  /** The Champion box: its left edge and its middle, level with the final. */
  readonly champion: { readonly left: number; readonly y: number } | null;
}

/**
 * The round headings and the Champion box, placed from the matches as
 * they are drawn (so they glide with them): every heading sits `gap` above
 * the highest match, centred on its column; the Champion box `gap` right of
 * the final, level with it. Boxes not measured yet are left out.
 */
export function bracketDecor(map: LinkMap, boxes: ReadonlyMap<NodeId, Box>, gap: number): BracketDecor {
  const grid = matchGrid(map);
  const names = roundNames(grid[0]?.length * 2 || 0);
  const placed = grid.flat().map((id) => boxes.get(id)).filter((b): b is Box => !!b);
  if (placed.length === 0) return { headings: [], champion: null };
  const top = Math.min(...placed.map((b) => b.center.y - b.size.height / 2));
  const headings: RoundHeading[] = [];
  for (const [r, column] of grid.entries()) {
    const box = column.map((id) => boxes.get(id)).find((b) => !!b);
    if (box) headings.push({ round: r + 1, text: names[r], x: box.center.x, bottom: top - gap });
  }
  const finalId = grid[grid.length - 1]?.[0];
  const final = finalId && matchOf(map, finalId) ? boxes.get(finalId) : undefined;
  const champion = final ? { left: final.center.x + final.size.width / 2 + gap, y: final.center.y } : null;
  return { headings, champion };
}
