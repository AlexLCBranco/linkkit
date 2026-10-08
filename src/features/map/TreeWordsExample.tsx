import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { arrowRoutes, roundedPath } from "../../domain/arrows";
import type { Box } from "../../domain/geometry";
import { layoutMap } from "../../domain/layout";
import { startOf } from "../../domain/tree";
import { exampleTree } from "../../domain/treeWords";
import { ARROW_LENGTH_PRESETS, type NodeId, type Size } from "../../domain/types";
import boxStyles from "./BoxView.module.css";
import lineStyles from "./LinkEdgeView.module.css";
import { layoutOptions, ROUTES } from "./layoutConfig";
import styles from "./TreeWordsExample.module.css";

const MAP = exampleTree();
const START = startOf(MAP);
const NODES = Object.values(MAP.nodes);
const LINKS = Object.values(MAP.links);

/**
 * The tree words' example, drawn as a real tree: Linkkit's boxes (the
 * canvas's own box style, in Treekit's text as new trees are) placed by
 * the tidy-tree layout, joined by the canvas's Elbow lines. Not a map:
 * nothing here can be clicked. The boxes are measured once they are drawn,
 * then laid out with their real sizes.
 */
export function TreeWordsExample() {
  const boxRefs = useRef(new Map<NodeId, HTMLDivElement>());
  const [sizes, setSizes] = useState<ReadonlyMap<NodeId, Size>>(new Map());

  useLayoutEffect(() => {
    const measured = new Map<NodeId, Size>();
    for (const [id, el] of boxRefs.current) measured.set(id, { width: el.offsetWidth, height: el.offsetHeight });
    setSizes(measured);
  }, []);

  const drawing = useMemo(() => {
    const options = layoutOptions(ARROW_LENGTH_PRESETS.medium, "TB", new Map(), "tree");
    const { positions, bounds } = layoutMap(MAP, sizes, options, "TB");
    // Shift everything so the drawing starts at (0, 0).
    const shift = (p: { x: number; y: number }) => ({ x: p.x - bounds.left, y: p.y - bounds.top });
    const boxes = new Map<NodeId, Box>(
      NODES.map((n) => [n.id, { center: shift(positions.get(n.id)!), size: sizes.get(n.id) ?? options.fallbackSize }]),
    );
    const routes = arrowRoutes(LINKS, boxes, "elbow", "TB", ROUTES);
    return { boxes, routes, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
  }, [sizes]);

  return (
    <div
      className={styles.stage}
      style={{ width: drawing.width, height: drawing.height }}
      data-label-style="treekit"
      // Hidden until measured, so the boxes don't jump into place.
      data-measured={sizes.size > 0 || undefined}
      aria-hidden
    >
      <svg className={styles.lines} width={drawing.width} height={drawing.height}>
        {[...drawing.routes.values()].map((route, i) => (
          <path key={i} className={lineStyles.line} d={roundedPath(route.points, route.corner)} fill="none" />
        ))}
      </svg>
      {NODES.map((node) => {
        const box = drawing.boxes.get(node.id)!;
        return (
          <div
            key={node.id}
            ref={(el) => {
              if (el) boxRefs.current.set(node.id, el);
            }}
            className={`${boxStyles.box} ${styles.box}`}
            data-start={node.id === START || undefined}
            style={{ left: box.center.x, top: box.center.y }}
          >
            <div className={boxStyles.name}>{node.name}</div>
          </div>
        );
      })}
    </div>
  );
}
