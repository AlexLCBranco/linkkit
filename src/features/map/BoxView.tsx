import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo, type CSSProperties } from "react";

import type { NodeId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { selectNodeHighlight } from "../../store/selectors";
import styles from "./BoxView.module.css";

/** React Flow's node record for a box. The box's content is not copied in:
    the component reads it from the store by id, so React Flow's node array
    only carries position. */
export type BoxFlowNode = Node<Record<string, never>, "box">;

/**
 * One box: its name, in Treekit's node style. A box grows with its name up
 * to `--box-max-width`, then wraps. Clicking it selects it (MapCanvas
 * handles the click); while a box is selected, every box shows whether the
 * selected one needs it, breaks without it, or neither.
 *
 * Subscribes narrowly: only to its own node record and its own highlight
 * (a short string), so a change to one box re-renders that box alone, and
 * a click re-renders only the boxes whose highlight changes.
 */
export const BoxView = memo(function BoxView({ id }: NodeProps<BoxFlowNode>) {
  const node = useMapStore((s) => s.map.nodes[id as NodeId]);
  const highlight = useMapStore((s) => selectNodeHighlight(s, id as NodeId));
  if (!node) return null;

  const style = node.color ? ({ "--box-accent": `var(--palette-${node.color})` } as CSSProperties) : undefined;

  return (
    <div
      className={styles.box}
      data-colored={node.color ? true : undefined}
      data-highlight={highlight ?? undefined}
      style={style}
    >
      {/* React Flow only draws an edge between nodes that have handles.
          Arrows are drawn box-to-box by LinkEdgeView, so these stay hidden. */}
      <Handle type="target" position={Position.Top} className={styles.handle} isConnectable={false} />
      <span className={styles.name} data-empty={node.name ? undefined : true}>
        {node.name || "Untitled"}
      </span>
      <Handle type="source" position={Position.Bottom} className={styles.handle} isConnectable={false} />
    </div>
  );
});
