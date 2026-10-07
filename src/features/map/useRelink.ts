import { useReactFlow } from "@xyflow/react";
import { useCallback, type PointerEvent as ReactPointerEvent } from "react";

import { relinkCheck } from "../../domain/map";
import type { LinkId, NodeId, Point } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { BOX_ID_ATTRIBUTE } from "./pageMarkers";

/** The box under the pointer, if any. */
function boxAt(x: number, y: number): NodeId | null {
  const hit = document.elementFromPoint(x, y)?.closest(`[${BOX_ID_ATTRIBUTE}]`);
  return (hit?.getAttribute(BOX_ID_ATTRIBUTE) as NodeId | null | undefined) ?? null;
}

/**
 * Dragging one end of an arrow (its round handle, shown while the arrow is
 * picked or pointed at) onto another box. While dragging, the box under the
 * pointer shows the target ring if letting go there would do something, or
 * the refused ring and a chip saying why if not (`relinkCheck`); letting go
 * asks the store (`reconnect`). Let go on bare paper: nothing changes.
 * Hand-written with pointer events, like a box's drag (`useBoxGestures`).
 */
export function useRelink(linkId: LinkId) {
  const { screenToFlowPosition } = useReactFlow();

  return useCallback(
    (end: "from" | "to") => (e: ReactPointerEvent<SVGElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      let last: { box: NodeId | null; at: Point } = { box: null, at: screenToFlowPosition({ x: e.clientX, y: e.clientY }) };

      const update = (ev: PointerEvent) => {
        const store = useMapStore.getState();
        const at = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        const box = boxAt(ev.clientX, ev.clientY);
        last = { box, at };
        const check = box ? relinkCheck(store.map, linkId, end, box) : null;
        store.setRelinking({
          link: linkId,
          end,
          at,
          target: check?.kind === "ok" ? box : null,
          refused: box && check?.kind === "refused" ? { box, text: check.text } : null,
        });
      };
      const finish = (ev: PointerEvent) => {
        el.removeEventListener("pointermove", update);
        el.removeEventListener("pointerup", finish);
        el.removeEventListener("pointercancel", finish);
        const store = useMapStore.getState();
        store.setRelinking(null);
        if (ev.type === "pointerup" && last.box) store.reconnect(linkId, end, last.box, last.at);
      };
      useMapStore.getState().selectLink(linkId);
      el.addEventListener("pointermove", update);
      el.addEventListener("pointerup", finish);
      el.addEventListener("pointercancel", finish);
    },
    [linkId, screenToFlowPosition],
  );
}
