import { useReactFlow } from "@xyflow/react";
import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";

import { clampToPage, pageSize } from "../../domain/page";
import { canLink } from "../../domain/rules";
import type { NodeId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { DRAG_THRESHOLD, MAP_LAYOUT, PAGE_INSETS } from "./layoutConfig";
import { BOX_ID_ATTRIBUTE, boxSizes, MAP_PAGE_ATTRIBUTE, MAP_VIEW_ATTRIBUTE, screenSize } from "./pageMarkers";

/** Counts drags, to give each its own undo key. */
let dragCount = 0;

/**
 * The two mouse gestures that start on a box (as in the prototype):
 *
 * - Press on the box: a click selects it; past a few pixels it becomes a
 *   drag that moves the box, kept on the screen (or on the bigger page
 *   that other boxes already make).
 * - Press on the box's dot: drags out a dashed arrow; letting go over
 *   another box draws the arrow, if the rules allow it. In a tree, letting
 *   go on empty paper adds a next step there.
 *
 * Both are hand-written with pointer events instead of React Flow's own
 * dragging and connecting, because those keep their own copy of positions
 * and connections. Here every step goes straight to the store, which stays
 * the only source of truth. Pointer capture keeps the gesture going even
 * when the pointer leaves the box.
 *
 * Positions come from React Flow's `screenToFlowPosition`: with the camera
 * locked, that is simply "where on the page", and it stays right even if
 * the page scrolls mid-drag.
 */
export function useBoxGestures(id: NodeId) {
  const { screenToFlowPosition } = useReactFlow();
  const [dragging, setDragging] = useState(false);

  const onBoxPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Primary button only, and never while typing in the box's name.
      if (e.button !== 0 || (e.target as Element).closest("textarea")) return;
      const el = e.currentTarget;
      const node = useMapStore.getState().map.nodes[id];
      if (!node) return;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);

      const start = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const startClient = { x: e.clientX, y: e.clientY };
      let moved = false;
      // Every move of this one drag shares a key, so the whole drag is one
      // undo step.
      const gesture = `drag:${++dragCount}`;
      // The room this box may use: the screen, or further where other boxes
      // already reach. Worked out once: nothing else moves during a drag.
      const page = el.closest(`[${MAP_PAGE_ATTRIBUTE}]`);
      const view = el.closest(`[${MAP_VIEW_ATTRIBUTE}]`);
      const room =
        page && view
          ? pageSize(useMapStore.getState().map, boxSizes(page), MAP_LAYOUT.fallbackSize, PAGE_INSETS, screenSize(view), id)
          : null;

      const move = (ev: PointerEvent) => {
        if (!moved && Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) < DRAG_THRESHOLD) return;
        if (!moved) setDragging(true);
        moved = true;
        const at = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        const size = { width: el.offsetWidth, height: el.offsetHeight };
        const to = { x: node.x + at.x - start.x, y: node.y + at.y - start.y };
        useMapStore.getState().moveBox(id, room ? clampToPage(to, size, room, PAGE_INSETS) : to, gesture);
      };
      const end = (ev: PointerEvent) => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        setDragging(false);
        if (!moved && ev.type === "pointerup") useMapStore.getState().select(id);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    },
    [id, screenToFlowPosition],
  );

  const onDotPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      // The dot sits on the box: without this the box would start a drag.
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);

      /** The box under the pointer, if an arrow to it is allowed. */
      const targetAt = (x: number, y: number): NodeId | null => {
        const hit = document.elementFromPoint(x, y)?.closest(`[${BOX_ID_ATTRIBUTE}]`);
        const to = hit?.getAttribute(BOX_ID_ATTRIBUTE) as NodeId | undefined;
        return to && canLink(useMapStore.getState().map, id, to).ok ? to : null;
      };
      /** Over the bare paper of a tree (not a box, arrow or label). */
      const onPaper = (x: number, y: number) =>
        useMapStore.getState().map.kind === "tree" &&
        !!document.elementFromPoint(x, y)?.classList.contains("react-flow__pane");
      const update = (ev: PointerEvent | ReactPointerEvent) =>
        useMapStore.getState().setConnecting({
          from: id,
          at: screenToFlowPosition({ x: ev.clientX, y: ev.clientY }),
          target: targetAt(ev.clientX, ev.clientY),
        });

      const end = (ev: PointerEvent) => {
        el.removeEventListener("pointermove", update);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        const { setConnecting, connect } = useMapStore.getState();
        const to = ev.type === "pointerup" ? targetAt(ev.clientX, ev.clientY) : null;
        setConnecting(null);
        if (to) connect(id, to);
        else if (ev.type === "pointerup" && onPaper(ev.clientX, ev.clientY)) {
          useMapStore.getState().addNextStep(id, screenToFlowPosition({ x: ev.clientX, y: ev.clientY }));
        }
      };
      update(e);
      el.addEventListener("pointermove", update);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    },
    [id, screenToFlowPosition],
  );

  return { dragging, onBoxPointerDown, onDotPointerDown };
}
