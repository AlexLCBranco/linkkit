import { Handle, Position, type Node } from "@xyflow/react";
import { memo } from "react";

import type { Size } from "../../domain/types";
import boxStyles from "./BoxView.module.css";

export type GhostFlowNode = Node<{ readonly size: Size | null }, "ghost">;

/**
 * A pinned match's stand-in on the scrolling page: an empty box the match's
 * size, where the match is drawn (the match itself is drawn in the layer
 * that stays still, `PinnedLayer`). React Flow only draws an arrow between
 * nodes it has, so the arrows from the last scrolling round reach the
 * pinned matches through these.
 */
export const PinnedGhost = memo(function PinnedGhost({ data }: { readonly data: GhostFlowNode["data"] }) {
  return (
    <div style={data.size ?? undefined} aria-hidden>
      <Handle type="target" position={Position.Left} className={boxStyles.handle} isConnectable={false} />
      <Handle type="source" position={Position.Right} className={boxStyles.handle} isConnectable={false} />
    </div>
  );
});
