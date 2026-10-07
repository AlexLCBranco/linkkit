import { useMemo } from "react";

import { layoutMap } from "../../domain/layout";
import type { LinkMap, NodeId, Size } from "../../domain/types";
import { MAP_LAYOUT, TEMPLATE_THUMB } from "../map/layoutConfig";
import styles from "./TemplateGallery.module.css";

/** Every box drawn the same size: the thumbnail shows the shape, not the
    words. */
const BOX: Size = TEMPLATE_THUMB.box;
const PAD = TEMPLATE_THUMB.padding;

/**
 * A template's shape in miniature: its boxes laid out as Tidy up would lay
 * them (`layoutMap`), as plain rounded blocks with lines between them,
 * scaled to fit. Drawn in the page's colours, so it reads as a tiny map.
 */
export function TemplateThumb({ map }: { readonly map: LinkMap }) {
  const drawn = useMemo(() => {
    const sizes = new Map<NodeId, Size>(Object.keys(map.nodes).map((id) => [id as NodeId, BOX]));
    const { positions, bounds } = layoutMap(map, sizes, { ...MAP_LAYOUT, rowGap: TEMPLATE_THUMB.rowGap, columnGap: TEMPLATE_THUMB.columnGap, fallbackSize: BOX });
    const lines = Object.values(map.links).flatMap((l) => {
      const a = positions.get(l.from);
      const b = positions.get(l.to);
      return a && b ? [{ id: l.id, a, b }] : [];
    });
    const view = `${bounds.left - PAD} ${bounds.top - PAD} ${bounds.right - bounds.left + 2 * PAD} ${bounds.bottom - bounds.top + 2 * PAD}`;
    return { positions: [...positions], lines, view };
  }, [map]);

  return (
    <svg className={styles.thumb} viewBox={drawn.view} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {drawn.lines.map(({ id, a, b }) => (
        <line key={id} className={styles.thumbLine} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      ))}
      {drawn.positions.map(([id, p]) => (
        <rect
          key={id}
          className={styles.thumbBox}
          x={p.x - BOX.width / 2}
          y={p.y - BOX.height / 2}
          width={BOX.width}
          height={BOX.height}
          rx={TEMPLATE_THUMB.radius}
        />
      ))}
    </svg>
  );
}
