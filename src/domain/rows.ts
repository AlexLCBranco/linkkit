import type { Link, LinkId, NodeId, Size } from "./types";

/**
 * The rows of a top-down tidy (a tree's and a Steps map's): how deep each
 * row is (its tallest box), and where it starts. The gap above a row is
 * `rowGap` plus the deepest label on the arrows into it (Treekit's "label
 * band"), so a tall label widens only its own gap. Each box is centred in
 * its row's depth (`rowMiddle`).
 */
export interface Rows {
  readonly start: readonly number[];
  readonly depth: readonly number[];
  /** From the top of the first row to the bottom of the last. */
  readonly total: number;
}

export function rowsDown(
  ids: readonly NodeId[],
  row: ReadonlyMap<NodeId, number>,
  arrows: readonly Link[],
  sizeOf: (id: NodeId) => Size,
  rowGap: number,
  labelSizes: ReadonlyMap<LinkId, Size>,
): Rows {
  const depth: number[] = [];
  const band: number[] = [];
  for (const id of ids) {
    const r = row.get(id)!;
    depth[r] = Math.max(depth[r] ?? 0, sizeOf(id).height);
  }
  for (const l of arrows) {
    const label = l.label ? labelSizes.get(l.id) : undefined;
    const r = row.get(l.to)!;
    band[r] = Math.max(band[r] ?? 0, label?.height ?? 0);
  }
  const start: number[] = [];
  let total = 0;
  for (let r = 0; r < depth.length; r++) {
    if (r > 0) total += rowGap + (band[r] ?? 0);
    start[r] = total;
    total += depth[r] ?? 0;
  }
  return { start, depth, total };
}

/** The y of a box's centre in row `r`. */
export const rowMiddle = (rows: Rows, r: number): number => rows.start[r] + rows.depth[r] / 2;
