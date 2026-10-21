import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useCallback } from "react";

import type { Point } from "../../domain/types";

/**
 * Where a point on the screen is on the page: React Flow's
 * `screenToFlowPosition`, also right when something outside scales the
 * whole map (the gauntlet whiteboard draws it scaled, inside its own zoom).
 * React Flow knows only its own zoom; the scale around it is read from how
 * big its area is drawn against its own size.
 */
export function usePagePoint(): (screen: Point) => Point {
  const { screenToFlowPosition } = useReactFlow();
  const flow = useStoreApi();
  return useCallback(
    (screen: Point) => {
      const { domNode, transform } = flow.getState();
      if (!domNode || domNode.offsetWidth === 0) return screenToFlowPosition(screen);
      const box = domNode.getBoundingClientRect();
      const outer = box.width / domNode.offsetWidth;
      if (Math.abs(outer - 1) < 1e-6) return screenToFlowPosition(screen);
      const [x, y, zoom] = transform;
      return { x: ((screen.x - box.left) / outer - x) / zoom, y: ((screen.y - box.top) / outer - y) / zoom };
    },
    [flow, screenToFlowPosition],
  );
}
