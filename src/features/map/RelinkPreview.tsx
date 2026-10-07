import { linkGeometry, type Box } from "../../domain/geometry";
import type { NodeId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import connect from "./ConnectPreview.module.css";
import drop from "./DropPreview.module.css";
import { ARROW } from "./layoutConfig";

const pointAt = (center: Box["center"]): Box => ({ center, size: { width: 0, height: 0 } });

/**
 * While an arrow's end is dragged (`useRelink`): the arrow it would become,
 * dashed (snapped to the box under the pointer when letting go there would
 * do it), and, over a box that refuses it, a chip beside the pointer
 * saying why. In a tree either end moves the box the arrow leads to, so
 * the preview always runs from the new parent to that box.
 */
export function RelinkPreview({ boxes }: { readonly boxes: ReadonlyMap<NodeId, Box> }) {
  const relinking = useMapStore((s) => s.relinking);
  const link = useMapStore((s) => (s.relinking ? s.map.links[s.relinking.link] : undefined));
  const isTree = useMapStore((s) => s.map.kind === "tree");
  if (!relinking || !link) return null;
  const moving = (relinking.target && boxes.get(relinking.target)) || pointAt(relinking.at);
  const fixedFrom = isTree || relinking.end === "from" ? null : boxes.get(link.from);
  const fixedTo = boxes.get(link.to);
  const from = isTree || relinking.end === "from" ? moving : fixedFrom;
  const to = isTree || relinking.end === "from" ? fixedTo : moving;
  const g = from && to ? linkGeometry(from, to, ARROW) : null;

  return (
    <>
      {g && (
        <svg className={connect.preview} aria-hidden>
          <path className={connect.line} d={`M${g.start.x} ${g.start.y}L${g.end.x} ${g.end.y}`} />
          <path className={connect.head} d={`M${g.head[0].x} ${g.head[0].y}L${g.head[1].x} ${g.head[1].y}L${g.head[2].x} ${g.head[2].y}Z`} />
        </svg>
      )}
      {relinking.refused && (
        <div className={drop.chip} data-refused style={{ left: relinking.at.x, top: relinking.at.y }} role="status">
          {relinking.refused.text}
        </div>
      )}
    </>
  );
}
