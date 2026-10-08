import { BaseEdge, EdgeLabelRenderer, useReactFlow, type Edge, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { memo, useCallback, useState } from "react";

import { InlineEditable } from "../../components/InlineEditable";

import { headPath, roundedPath, routeEnds, routeMiddle, towards, type ArrowRoute } from "../../domain/arrows";
import { looksCut } from "../../domain/status";
import type { LinkId, Point, Size } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { selectLinkHighlight } from "../../store/selectors";
import styles from "./LinkEdgeView.module.css";
import { LINK_HANDLE_INSET, LINK_HANDLE_RADIUS } from "./layoutConfig";
import { LINK_ID_ATTRIBUTE } from "./pageMarkers";
import { useRelink } from "./useRelink";

export interface LinkEdgeData extends Record<string, unknown> {
  /** Where the line and head go, in the map's arrow style; `null` when
      the boxes overlap (or are not measured yet) and there is no room for
      an arrow. */
  readonly geometry: ArrowRoute | null;
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
 * is needed, and its label (as in the prototype); or, in the elbow arrow
 * style, Treekit's right-angled line (`domain/arrows.ts`).
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
 * Click the line itself to pick the arrow (Delete then deletes it, and
 * right-click offers the same): a picked arrow, or one the pointer is on,
 * shows a round handle on each end. Drag a handle onto another box to
 * reconnect that end (`useRelink`); in a tree, either end moves the box
 * the arrow leads to under that box. Where the rules refuse a delete (a
 * tree box's only way in) the × still shows, and says why when pressed.
 *
 * An arrow without a label (a tree's, until one is typed) has no pill.
 * Pointing at it shows a small chip in its middle: "+ label" opens a field
 * to type one ("if yes"), and the × deletes the arrow -- except one the
 * rules won't let go (a tree box's only way in), which shows no ×. The
 * chip is not measured, so it never changes how much room Tidy up leaves
 * on the arrow: only a real label does.
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
  const isPicked = useMapStore((s) => s.selectedLink === linkId);
  const isRelinking = useMapStore((s) => s.relinking?.link === linkId);
  const selectLink = useMapStore((s) => s.selectLink);
  const relink = useRelink(linkId);
  const { screenToFlowPosition } = useReactFlow();
  const kind = useMapStore((s) => s.map.kind);
  // The box it leads to looks cut: the arrow fades and dashes with it.
  const isCut = useMapStore((s) => {
    const to = s.map.links[linkId]?.to;
    return to !== undefined && looksCut(s.map).has(to);
  });
  // The pointer is on the line itself (a label-less arrow shows its chip
  // then).
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
  const at = data.labelAt ?? routeMiddle(g);
  const line = roundedPath(g.points, g.corner);
  const ends = routeEnds(g);
  const spot = { transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` };
  const hasPill = label !== "" || isEditing;
  const showEnds = isPicked || hot || isRelinking;
  // The end handles sit a little way along the line from each end.
  const fromEnd = towards(...ends.from, LINK_HANDLE_INSET);
  const toEnd = towards(...ends.to, LINK_HANDLE_INSET);
  const deleteButton = (
    <button
      type="button"
      className={styles.delete}
      onClick={(e) => {
        e.stopPropagation();
        deleteLink(linkId, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }}
      aria-label="Delete arrow"
      title="Delete arrow"
    >
      <X size={10} strokeWidth={2.5} />
    </button>
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={line}
        className={styles.line}
        data-highlight={highlight}
        data-cut={isCut || undefined}
        data-picked={isPicked || undefined}
        data-relinking={isRelinking || undefined}
      />
      {g.head && (
        <path
          className={styles.head}
          data-highlight={highlight}
          data-cut={isCut || undefined}
          data-picked={isPicked || undefined}
          data-relinking={isRelinking || undefined}
          d={headPath(g.head)}
        />
      )}
      {/* The line and its end handles, in one group so moving from the line
          onto a handle keeps them shown. The hit line is wider than the
          drawn one, easy to point at and click. */}
      <g onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)} {...{ [LINK_ID_ATTRIBUTE]: linkId }}>
        <path
          className={styles.hit}
          d={line}
          onClick={(e) => {
            e.stopPropagation();
            selectLink(linkId);
          }}
        >
          <title>Click to pick this arrow; drag its ends to reconnect it</title>
        </path>
        {showEnds && (
          <>
            <circle className={styles.end} cx={fromEnd.x} cy={fromEnd.y} r={LINK_HANDLE_RADIUS} onPointerDown={relink("from")}>
              <title>Drag onto another box</title>
            </circle>
            <circle className={styles.end} cx={toEnd.x} cy={toEnd.y} r={LINK_HANDLE_RADIUS} onPointerDown={relink("to")}>
              <title>Drag onto another box</title>
            </circle>
          </>
        )}
      </g>
      <EdgeLabelRenderer>
        {!hasPill ? (
          // Keyed apart from the pill, so switching between them swaps the
          // element and the pill reports its size gone at once (a re-tidy
          // right after a label is emptied must not keep its room). The
          // spot is not measured: only a real label takes room on an arrow.
          <div
            key="chip"
            className={`${styles.bare} nodrag nopan`}
            {...{ [LINK_ID_ATTRIBUTE]: linkId }}
            data-hot={hot || isPicked || undefined}
            data-highlight={highlight}
            style={spot}
            // The spot sits on the line's middle: a click there picks the
            // arrow, as anywhere else on the line.
            onClick={() => selectLink(linkId)}
            onPointerEnter={() => setHot(true)}
            onPointerLeave={() => setHot(false)}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <div className={styles.chip}>
              <button
                type="button"
                className={styles.addLabel}
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing({ kind: "link", id: linkId });
                }}
                title="Give this arrow a label"
              >
                + label
              </button>
              {deleteButton}
            </div>
          </div>
        ) : (
          <div
            key="pill"
            ref={measure}
            {...{ [LINK_ID_ATTRIBUTE]: linkId }}
            // React Flow's opt-out classes: a press here is the label's own.
            className={`${styles.label} nodrag nopan`}
            data-highlight={highlight}
            data-cut={isCut || undefined}
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
                onDone={() => stopEditing()}
                placeholder={kind === "tree" ? "if yes" : "needs"}
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
