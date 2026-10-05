import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { memo, useCallback, useState } from "react";

import { InlineEditable } from "../../components/InlineEditable";

import type { LinkGeometry } from "../../domain/geometry";
import { canDeleteLink } from "../../domain/rules";
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
 * Mouse (as in the prototype): click the label to type a new one (left
 * empty, it goes back to "needs"); the × on its corner deletes the arrow.
 *
 * A tree's arrows have no label: no pill, just a small × in the arrow's
 * middle that shows while the pointer is on the arrow. An arrow the rules
 * won't let go (a tree box's only way in) shows no × at all.
 *
 * Subscribes narrowly: only to its own label text, its own highlight and
 * whether its label is being typed in.
 */
export const LinkEdgeView = memo(function LinkEdgeView({ id, data }: EdgeProps<LinkFlowEdge>) {
  const linkId = id as LinkId;
  const label = useMapStore((s) => s.map.links[linkId]?.label ?? "");
  const highlight = useMapStore((s) => selectLinkHighlight(s, linkId)) ?? undefined;
  const isEditing = useMapStore((s) => s.editing?.kind === "link" && s.editing.id === linkId);
  const startEditing = useMapStore((s) => s.startEditing);
  const stopEditing = useMapStore((s) => s.stopEditing);
  const setLinkLabel = useMapStore((s) => s.setLinkLabel);
  const deleteLink = useMapStore((s) => s.deleteLink);
  const deletable = useMapStore((s) => canDeleteLink(s.map, linkId));
  // The pointer is on the line itself (a label-less arrow shows its × then).
  const [hot, setHot] = useState(false);

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
  const line = `M${g.start.x} ${g.start.y}L${g.end.x} ${g.end.y}`;
  const spot = { transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` };
  const hasPill = label !== "" || isEditing;
  const deleteButton = deletable && (
    <button
      type="button"
      className={styles.delete}
      onClick={(e) => {
        e.stopPropagation();
        deleteLink(linkId);
      }}
      aria-label="Delete arrow"
      title="Delete arrow"
    >
      <X size={10} strokeWidth={2.5} />
    </button>
  );

  return (
    <>
      <BaseEdge id={id} path={line} className={styles.line} data-highlight={highlight} />
      <path
        className={styles.head}
        data-highlight={highlight}
        d={`M${tip.x} ${tip.y}L${left.x} ${left.y}L${right.x} ${right.y}Z`}
      />
      {!hasPill && deletable && (
        // A wider, invisible line to point at.
        <path
          className={styles.hit}
          d={line}
          onPointerEnter={() => setHot(true)}
          onPointerLeave={() => setHot(false)}
        />
      )}
      <EdgeLabelRenderer>
        {!hasPill ? (
          deletable && (
            <div
              ref={measure}
              className={`${styles.bare} nodrag nopan`}
              data-hot={hot || undefined}
              data-highlight={highlight}
              style={spot}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {deleteButton}
            </div>
          )
        ) : (
          <div
            ref={measure}
            // React Flow's opt-out classes: a press here is the label's own.
            className={`${styles.label} nodrag nopan`}
            data-highlight={highlight}
            data-editing={isEditing || undefined}
            style={spot}
            onClick={() => startEditing({ kind: "link", id: linkId })}
            onDoubleClick={(e) => e.stopPropagation()}
            title={isEditing ? undefined : "Click to change the label"}
          >
            {isEditing ? (
              <InlineEditable
                value={label}
                editing
                onCommit={(next) => setLinkLabel(linkId, next)}
                onDone={stopEditing}
                placeholder="needs"
                ariaLabel="Arrow label"
              />
            ) : (
              <>
                <span className={styles.text}>{label}</span>
                {/* Floats on the corner, so showing it never changes the
                    label's size (labels are measured to keep them apart). */}
                {deleteButton}
              </>
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
});
