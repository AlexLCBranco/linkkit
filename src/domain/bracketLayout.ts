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
  // The rounds still shown: with the first ones hidden (`shownMap`), the
  // first round shown takes round 1's place, stacked from the top.
  const grid = matchGrid(map).filter((column) => column);
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
 * the final, level with it. Boxes not measured yet are left out. With the
 * later rounds pinned from round `pinnedFrom` (`pinnedRounds`), their
 * headings sit over the pinned block instead, and follow it down.
 */
export function bracketDecor(map: LinkMap, boxes: ReadonlyMap<NodeId, Box>, gap: number, pinnedFrom = 0): BracketDecor {
  const grid = matchGrid(map);
  const names = roundNames(grid[0]?.length * 2 || 0);
  const placed = grid.flat().map((id) => boxes.get(id)).filter((b): b is Box => !!b);
  if (placed.length === 0) return { headings: [], champion: null };
  const topOf = (columns: readonly NodeId[][]) => {
    const tops = columns.flat().flatMap((id) => {
      const b = boxes.get(id);
      return b ? [b.center.y - b.size.height / 2] : [];
    });
    return tops.length > 0 ? Math.min(...tops) : null;
  };
  const split = pinnedFrom > 1 ? pinnedFrom - 1 : grid.length;
  const top = topOf(grid.slice(0, split));
  const pinnedTop = topOf(grid.slice(split)) ?? top;
  const headings: RoundHeading[] = [];
  for (const [r, column] of grid.entries()) {
    const box = column.map((id) => boxes.get(id)).find((b) => !!b);
    const above = r >= split || top === null ? pinnedTop! : top;
    if (box) headings.push({ round: r + 1, text: names[r], x: box.center.x, bottom: above - gap });
  }
  const finalId = grid[grid.length - 1]?.[0];
  const final = finalId && matchOf(map, finalId) ? boxes.get(finalId) : undefined;
  const champion = final ? { left: final.center.x + final.size.width / 2 + gap, y: final.center.y } : null;
  return { headings, champion };
}

/**
 * Pinned later rounds (owner's request, 2026-10-17, as on bracket.tennis):
 * from round `from` on, the matches are drawn packed together and follow
 * the screen down as the page scrolls, so the later rounds stay in view
 * while the early rounds scroll past them; the arrows from the last
 * scrolling round run to them wherever they are.
 *
 * Returns the height (`y`, in page units) each pinned match is drawn at;
 * its across-the-page place stays its own. The first pinned round stacks
 * one slot (the tallest match plus `columnGap`) apart, each later round
 * halfway between its feeders, as Tidy up does. The block's top follows
 * `viewTop` (the page's top edge in view) plus `above` (room for the
 * headings), but never above the bracket's top nor past its bottom.
 * Nothing is pinned when `from` is not a round after the first one shown.
 * Works on the matches as they stand (`centres`), so it is a drawing only:
 * the saved places never change.
 */
export function pinnedRounds(
  map: LinkMap,
  centres: ReadonlyMap<NodeId, Point>,
  sizes: ReadonlyMap<NodeId, Size>,
  fallback: Size,
  from: number,
  viewTop: number,
  above: number,
  columnGap: number,
): Map<NodeId, number> {
  const out = new Map<NodeId, number>();
  const grid = matchGrid(map);
  const first = grid.findIndex((column) => column);
  const p = from - 1;
  if (first < 0 || p <= first || !grid[p]) return out;
  const sizeOf = (id: NodeId) => sizes.get(id) ?? fallback;
  const edges = (ids: readonly NodeId[]) => {
    const placed = ids.filter((id) => centres.has(id));
    return {
      top: Math.min(...placed.map((id) => centres.get(id)!.y - sizeOf(id).height / 2)),
      bottom: Math.max(...placed.map((id) => centres.get(id)!.y + sizeOf(id).height / 2)),
    };
  };
  const { top, bottom } = edges(grid[first]);
  if (!Number.isFinite(top)) return out;
  const pinned = grid.slice(p);
  const slot = Math.max(...pinned.flat().map((id) => sizeOf(id).height)) + columnGap;
  // Packed, as if the block's top edge were at 0.
  const packed = new Map<NodeId, number>();
  for (const [r, column] of pinned.entries()) {
    column.forEach((id, i) => {
      const y = r === 0 ? slot / 2 + i * slot : (packed.get(pinned[r - 1][2 * i])! + packed.get(pinned[r - 1][2 * i + 1])!) / 2;
      packed.set(id, y);
    });
  }
  const height = pinned[0].length * slot;
  const blockTop = top - columnGap / 2 + Math.max(0, Math.min(viewTop + above - top, bottom - top - height + columnGap));
  for (const [id, y] of packed) out.set(id, blockTop + y);
  return out;
}
