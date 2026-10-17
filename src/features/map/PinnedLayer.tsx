import { ReactFlow, ReactFlowProvider, type NodeChange, type NodeOrigin, type NodeTypes, type EdgeTypes } from "@xyflow/react";

import type { Box } from "../../domain/geometry";
import type { NodeId } from "../../domain/types";
import { BracketDecor } from "./BracketDecor";
import type { LinkFlowEdge } from "./LinkEdgeView";
import type { MatchFlowNode } from "./MatchBox";
import styles from "./MapCanvas.module.css";
import { BRACKET_DECOR, BRACKET_PIN_ABOVE } from "./layoutConfig";

const CENTER_ORIGIN: NodeOrigin = [0.5, 0.5];

interface PinnedLayerProps {
  readonly nodes: MatchFlowNode[];
  readonly edges: LinkFlowEdge[];
  readonly boxes: ReadonlyMap<NodeId, Box>;
  readonly from: number;
  /** The screen's height, in pixels: the layer's own. */
  readonly height: number;
  /** Where the page is drawn sideways, and its zoom. */
  readonly x: number;
  readonly zoom: number;
  readonly nodeTypes: NodeTypes;
  readonly edgeTypes: EdgeTypes;
  readonly onNodesChange: (changes: NodeChange<MatchFlowNode>[]) => void;
}

/**
 * A bracket's pinned later rounds (`pinnedRounds`), as on bracket.tennis:
 * drawn in a layer the size of the screen that the browser itself holds
 * still while the page scrolls up and down (CSS sticky), so they never
 * move, not even for a frame; sideways it scrolls with the page. Its own
 * React Flow draws the pinned matches, the arrows between them, their
 * headings and the Champion box, in screen-high page units (0 is the
 * screen's top edge). Only the arrows from the last scrolling round, drawn
 * on the page, move as it scrolls.
 */
export function PinnedLayer(props: PinnedLayerProps) {
  const { nodes, edges, boxes, from, height, x, zoom, nodeTypes, edgeTypes, onNodesChange } = props;
  return (
    <div className={styles.pinned} style={{ height, marginTop: -height }} data-pinned-layer>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodeOrigin={CENTER_ORIGIN}
          onNodesChange={onNodesChange}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          viewport={{ x, y: 0, zoom }}
          minZoom={zoom}
          maxZoom={zoom}
          panActivationKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          deleteKeyCode={null}
          disableKeyboardA11y
          proOptions={{ hideAttribution: true }}
        />
        <div className={styles.sheet} style={{ transform: `translate(${x}px, 0) scale(${zoom})` }}>
          <BracketDecor boxes={boxes} pinned={{ from, headingBottom: BRACKET_PIN_ABOVE - BRACKET_DECOR.gap }} />
        </div>
      </ReactFlowProvider>
    </div>
  );
}
