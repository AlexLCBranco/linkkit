import { useCallback, useEffect, useRef, useState } from "react";

import { glidePositions } from "../../domain/glide";
import { shownMap } from "../../domain/status";
import type { LinkMap, NodeId, Point } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";

type Nodes = LinkMap["nodes"];

/** How long past its end a glide may run before it is cut short. */
const GLIDE_BACKSTOP_MS = 200;

/**
 * Tidy up's glide. The store already holds the boxes' new places (one
 * change, saved once); this only draws them on their way there, frame by
 * frame, for a moment.
 *
 * Why in JS instead of a CSS `transition` on the box (as in Treekit's
 * `useAnimatedPositions`): arrows are drawn from box positions. A CSS
 * transition would slide the box but leave its arrows jumping straight to
 * the end; feeding in-between positions keeps arrows and labels attached.
 *
 * Any other change to the boxes mid-glide (one grabbed and dragged, say)
 * ends it at once: the map, not the animation, is what counts.
 */
export function useGlide(nodes: Nodes, durationMs: number) {
  const [glide, setGlide] = useState<{ nodes: Nodes; at: ReadonlyMap<NodeId, Point> } | null>(null);
  const frame = useRef(0);
  const backstop = useRef(0);

  /** Glides from `from` to where `after` puts every box. */
  const start = useCallback(
    (from: ReadonlyMap<NodeId, Point>, after: Nodes) => {
      cancelAnimationFrame(frame.current);
      clearTimeout(backstop.current);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setGlide(null);
        return;
      }
      const to = new Map<NodeId, Point>(Object.values(after).map((n) => [n.id, { x: n.x, y: n.y }]));
      const startTime = performance.now();
      setGlide({ nodes: after, at: glidePositions(from, to, 0) });
      const tick = (now: number) => {
        const t = (now - startTime) / durationMs;
        if (t >= 1 || shownMap(useMapStore.getState().map).nodes !== after) {
          setGlide(null);
          return;
        }
        setGlide({ nodes: after, at: glidePositions(from, to, t) });
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
      // Browsers pause animation frames in a hidden or throttled tab; the
      // boxes must still end up drawn where they are, not stuck halfway.
      backstop.current = window.setTimeout(() => {
        cancelAnimationFrame(frame.current);
        setGlide(null);
      }, durationMs + GLIDE_BACKSTOP_MS);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(backstop.current);
    },
    [],
  );

  /** Where to draw boxes right now, or `null` to draw them where the map says. */
  const shown = glide && glide.nodes === nodes ? glide.at : null;
  return { shown, start };
}
