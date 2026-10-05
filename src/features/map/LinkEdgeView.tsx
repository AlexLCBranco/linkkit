import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from "@xyflow/react";
import { memo, useCallback } from "react";

import type { LinkGeometry } from "../../domain/geometry";
import type { LinkId, Point, Size } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { selectLinkHighlight } from "../../store/selectors";
import styles from "./LinkEdgeView.module.css";

export interface LinkEdgeData extends Record<string, unknown> {
  /** Where the line and head go; `null` when the boxes overlap (or are
      not measured yet) and there is no room for an arrow. */
  readonly geometry: LinkGeometry | null;
  /** The label's centre, from `placeLabels`. */
  readonly labelAt: Point | null;
  /** Reports the label's size (or `null` once it is gone), so labels can
      be placed clear of each other. */
  readonly onLabelSize: (id: LinkId, size: Size | null) => void;
}

/** React Flow's edge record for an arrow. The label text is not copied in:
    the component reads it from the store by id. */
export type LinkFlowEdge = Edge<LinkEdgeData, "link">;

/**
 * One arrow: a straight line from box to box with a head at the end that
 * is needed, and its label (as in the prototype).
 *
 * The geometry comes worked out from the canvas (`domain/geometry.ts`,
 * `domain/labels.ts`), not from React Flow's handles: the line leaves each
 * box on the side facing the other, wherever that is, and the labels are
 * placed together so they don't pile up.
 *
 * While a box is selected, an arrow on a "needs" path turns teal, one on a
 * "breaks" path orange, and the rest fade.
 *
 * Subscribes narrowly: only to its own label text and its own highlight.
 */
export const LinkEdgeView = memo(function LinkEdgeView({ id, data }: EdgeProps<LinkFlowEdge>) {
  const linkId = id as LinkId;
  const label = useMapStore((s) => s.map.links[linkId]?.label ?? "");
  const highlight = useMapStore((s) => selectLinkHighlight(s, linkId)) ?? undefined;

  const onLabelSize = data?.onLabelSize;
  // Measures the pill with a ResizeObserver while it is on screen (as in
  // Treekit). A ref callback that returns a cleanup (React 19) pairs start
  // and stop in one place. Memoised: React re-runs a ref callback whenever
  // it is a new function, and each run reports a size, which re-renders --
  // a new function every time would loop forever.
  const measure = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !onLabelSize) return;
      const report = () => onLabelSize(linkId, { width: el.offsetWidth, height: el.offsetHeight });
      const observer = new ResizeObserver(report);
      observer.observe(el);
      report();
      return () => {
        observer.disconnect();
        onLabelSize(linkId, null);
      };
    },
    [linkId, onLabelSize],
  );

  const g = data?.geometry;
  if (!g) return null;
  const [tip, left, right] = g.head;
  const at = data.labelAt ?? g.middle;

  return (
    <>
      <BaseEdge
        id={id}
        path={`M${g.start.x} ${g.start.y}L${g.end.x} ${g.end.y}`}
        className={styles.line}
        data-highlight={highlight}
      />
      <path
        className={styles.head}
        data-highlight={highlight}
        d={`M${tip.x} ${tip.y}L${left.x} ${left.y}L${right.x} ${right.y}Z`}
      />
      <EdgeLabelRenderer>
        <div
          ref={measure}
          className={styles.label}
          data-highlight={highlight}
          style={{ transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
