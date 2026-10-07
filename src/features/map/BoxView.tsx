import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ChevronsDownUp, ChevronsUpDown, Palette, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { memo, type CSSProperties, type MouseEvent, type PointerEvent } from "react";

import { InlineEditable } from "../../components/InlineEditable";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { canCollapse, canDeleteBox, canSetStatus } from "../../domain/rules";
import { hiddenAfter } from "../../domain/shown";
import { looksCut } from "../../domain/status";
import type { NodeId, NodeStatus } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { selectNodeHighlight } from "../../store/selectors";
import styles from "./BoxView.module.css";
import { StatusRow } from "./StatusRow";
import { STATUS_META } from "./statusMeta";
import { SwatchRow } from "./SwatchRow";
import { BOX_ID_ATTRIBUTE } from "./pageMarkers";
import { useBoxGestures } from "./useBoxGestures";

/** React Flow's node record for a box. The box's content is not copied in:
    the component reads it from the store by id, so React Flow's node array
    only carries position. */
export type BoxFlowNode = Node<Record<string, never>, "box">;

/** Buttons on a box do their own thing: a press on them must not start a
    drag, and a double-click must not open the name. */
const keepToButton = (e: PointerEvent | MouseEvent) => e.stopPropagation();

/**
 * One box: its name, in Treekit's node style. A box grows with its name up
 * to `--box-max-width`, then wraps. While a box is selected, every box
 * shows whether the selected one needs it, breaks without it, or neither.
 *
 * Mouse: click selects, drag moves, double-click renames. On hover (or
 * while selected) it shows a dot on its right edge to drag an arrow from,
 * and a toolbar above it to rename, colour or delete it (Treekit's hover
 * toolbar; the prototype had a corner ×). Right-click opens the same
 * choices (BoxContextMenu). In a tree the toolbar also has "+" (add a
 * next step), and the start has no bin (it can't be deleted).
 *
 * A tree step can be marked keep / maybe / cut (the tag in the toolbar, or
 * the right-click menu): a badge on its top-left corner shows it, and a box
 * that looks cut (cut, or only reached through cut boxes) fades under a
 * veil with a dashed border.
 *
 * A tree box with next steps can be collapsed (the toolbar's ⇕, its menu,
 * or Space): its branch leaves the page, and a "+N" badge on the edge its
 * next steps leave from says how many boxes are folded away; clicking it
 * opens the branch again.
 *
 * One of several boxes picked together (the marquee) shows the selection
 * ring, without the toolbar: dragging any of them moves them all.
 *
 * Subscribes narrowly: only to its own node record, its own highlight (a
 * short string) and whether it is picked, being typed in or connected to,
 * so a change to one box re-renders that box alone.
 */
export const BoxView = memo(function BoxView({ id }: NodeProps<BoxFlowNode>) {
  const nodeId = id as NodeId;
  const node = useMapStore((s) => s.map.nodes[nodeId]);
  const highlight = useMapStore((s) => selectNodeHighlight(s, nodeId));
  const isPicked = useMapStore((s) => s.group.includes(nodeId));
  const isEditing = useMapStore((s) => s.editing?.kind === "box" && s.editing.id === nodeId);
  const isTarget = useMapStore((s) => s.connecting?.target === nodeId);
  const isSource = useMapStore((s) => s.connecting?.from === nodeId);
  const startEditing = useMapStore((s) => s.startEditing);
  const stopEditing = useMapStore((s) => s.stopEditing);
  const renameBox = useMapStore((s) => s.renameBox);
  const deleteBox = useMapStore((s) => s.deleteBox);
  const setBoxColor = useMapStore((s) => s.setBoxColor);
  const addNextStep = useMapStore((s) => s.addNextStep);
  const isTree = useMapStore((s) => s.map.kind === "tree");
  const deletable = useMapStore((s) => canDeleteBox(s.map, nodeId));
  const statusable = useMapStore((s) => canSetStatus(s.map, nodeId));
  const isCut = useMapStore((s) => looksCut(s.map).has(nodeId));
  const setBoxesStatus = useMapStore((s) => s.setBoxesStatus);
  const foldable = useMapStore((s) => canCollapse(s.map, nodeId));
  const isCollapsed = useMapStore((s) => s.map.collapsed.includes(nodeId));
  const folded = useMapStore((s) => (s.map.collapsed.includes(nodeId) ? hiddenAfter(s.map, nodeId) : 0));
  const direction = useMapStore((s) => s.map.direction);
  const toggleCollapsed = useMapStore((s) => s.toggleCollapsed);
  const { dragging, onBoxPointerDown, onDotPointerDown } = useBoxGestures(nodeId);
  if (!node) return null;

  const style = node.color ? ({ "--box-accent": `var(--palette-${node.color})` } as CSSProperties) : undefined;
  const rename = () => startEditing({ kind: "box", id: nodeId });

  return (
    <div
      {...{ [BOX_ID_ATTRIBUTE]: nodeId }}
      className={styles.box}
      data-colored={node.color ? true : undefined}
      data-highlight={highlight ?? undefined}
      data-picked={isPicked || undefined}
      data-editing={isEditing || undefined}
      data-dragging={dragging || undefined}
      data-connect-target={isTarget || undefined}
      data-connect-source={isSource || undefined}
      data-cut={isCut || undefined}
      data-direction={direction}
      style={style}
      onPointerDown={onBoxPointerDown}
      onDoubleClick={rename}
    >
      {/* React Flow only draws an edge between nodes that have handles.
          Arrows are drawn box-to-box by LinkEdgeView, so these stay hidden. */}
      <Handle type="target" position={Position.Top} className={styles.handle} isConnectable={false} />
      <InlineEditable
        value={node.name}
        editing={isEditing}
        onCommit={(name) => renameBox(nodeId, name)}
        onDone={stopEditing}
        placeholder={isEditing ? "Type a name" : "Untitled"}
        ariaLabel="Box name"
        className={styles.name}
      />
      <Handle type="source" position={Position.Bottom} className={styles.handle} isConnectable={false} />

      {node.status && <StatusBadge status={node.status} />}

      {isCollapsed && folded > 0 && (
        <button
          type="button"
          className={styles.folded}
          onPointerDown={keepToButton}
          onDoubleClick={keepToButton}
          onClick={() => toggleCollapsed([nodeId])}
          aria-label={`Expand: ${folded} hidden`}
          title={`${folded} hidden: click to expand (Space)`}
        >
          +{folded}
        </button>
      )}

      {/* Drag from here to another box to draw an arrow. */}
      <span
        className={styles.dot}
        onPointerDown={onDotPointerDown}
        onDoubleClick={keepToButton}
        title="Drag to another box to connect"
        aria-hidden
      />

      <div className={styles.toolbar} onPointerDown={keepToButton} onDoubleClick={keepToButton}>
        {isTree && (
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => addNextStep(nodeId)}
            aria-label="Add a next step"
            title="Add a next step"
          >
            <Plus size={14} />
          </button>
        )}
        <button type="button" className={styles.toolbarButton} onClick={rename} aria-label="Rename" title="Rename">
          <Pencil size={14} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={styles.toolbarButton} aria-label="Colour" title="Colour">
              <Palette size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-auto" side="top" align="center" onCloseAutoFocus={(e) => e.preventDefault()}>
            <SwatchRow value={node.color} onPick={(c) => setBoxColor(nodeId, c)} Item={DropdownMenuItem} />
          </DropdownMenuContent>
        </DropdownMenu>
        {foldable && (
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => toggleCollapsed([nodeId])}
            aria-label={isCollapsed ? "Expand branch" : "Collapse branch"}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? "Expand branch (Space)" : "Collapse branch (Space)"}
          >
            {isCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          </button>
        )}
        {statusable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={styles.toolbarButton} aria-label="Keep, maybe or cut" title="Keep, maybe or cut">
                <Tag size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-auto" side="top" align="center" onCloseAutoFocus={(e) => e.preventDefault()}>
              <StatusRow value={node.status} onPick={(status) => setBoxesStatus([nodeId], status)} Item={DropdownMenuItem} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {deletable && (
          <button
            type="button"
            className={`${styles.toolbarButton} ${styles.delete}`}
            onClick={() => deleteBox(nodeId)}
            aria-label="Delete box"
            title="Delete box (Del)"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
});

/** The status marker on the box's top-left corner: neutral, so it never
    competes with a colour tint (Treekit's). */
function StatusBadge({ status }: { readonly status: NodeStatus }) {
  const { label, icon: Icon } = STATUS_META[status];
  return (
    <span className={styles.badge} data-status={status} role="img" aria-label={label} title={label}>
      <Icon size={10} strokeWidth={2.5} aria-hidden />
    </span>
  );
}
