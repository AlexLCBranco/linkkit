import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ChevronsDownUp, ChevronsUpDown, NotebookPen, Palette, Pencil, Plus, StickyNote, Tag, Trash2 } from "lucide-react";
import { memo, type CSSProperties, type MouseEvent, type PointerEvent } from "react";

import { InlineEditable } from "../../components/InlineEditable";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { arrowsInto, canAddNextStep, canCollapse, canDeleteBox, canSetStatus } from "../../domain/rules";
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
 * next step; not on a card in a tree linked to Boardkit), and the start
 * has no bin (it can't be deleted).
 *
 * Any box can carry notes (the notebook in the toolbar, the right-click
 * menu, or N): they open in a side panel (NotesPanel), and a box with
 * notes shows an icon on its top-right corner and their first lines on
 * hover.
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
  const isTarget = useMapStore((s) => s.connecting?.target === nodeId || s.relinking?.target === nodeId);
  // Something dragged over this box that it refuses: the ring says no
  // before the mouse is let go (the chip beside the pointer says why).
  const isRefusedTarget = useMapStore(
    (s) =>
      s.connecting?.refused?.box === nodeId ||
      s.relinking?.refused?.box === nodeId ||
      (s.dropping?.parent === nodeId && s.dropping.bar === null && s.dropping.refusal !== null),
  );
  const isSource = useMapStore((s) => s.connecting?.from === nodeId);
  // Dragged onto this box, it would become its next step.
  const isDropTarget = useMapStore(
    (s) => s.dropping?.parent === nodeId && s.dropping.bar === null && s.dropping.refusal === null && !s.dropping.already,
  );
  const isDropping = useMapStore((s) => s.dropping?.box === nodeId && s.dropping.refusal === null);
  // Dragged over a box that refuses it: the pointer says "not allowed" too.
  const isDropRefused = useMapStore((s) => s.dropping?.box === nodeId && s.dropping.refusal !== null);
  const startEditing = useMapStore((s) => s.startEditing);
  const stopEditing = useMapStore((s) => s.stopEditing);
  const renameBox = useMapStore((s) => s.renameBox);
  const pasteOutline = useMapStore((s) => s.pasteOutline);
  const deleteBox = useMapStore((s) => s.deleteBox);
  const setBoxColor = useMapStore((s) => s.setBoxColor);
  const addNextStep = useMapStore((s) => s.addNextStep);
  const isTree = useMapStore((s) => s.map.kind === "tree");
  const isLinked = useMapStore((s) => !!s.map.linkedBoard);
  // A tree's start box: Treekit's label style shows it as the heading.
  const isStart = useMapStore((s) => s.map.kind === "tree" && arrowsInto(s.map, nodeId) === 0);
  const addable = useMapStore((s) => canAddNextStep(s.map, nodeId));
  const deletable = useMapStore((s) => canDeleteBox(s.map, nodeId));
  const statusable = useMapStore((s) => canSetStatus(s.map, nodeId));
  const isCut = useMapStore((s) => looksCut(s.map).has(nodeId));
  const setBoxesStatus = useMapStore((s) => s.setBoxesStatus);
  const foldable = useMapStore((s) => canCollapse(s.map, nodeId));
  const isCollapsed = useMapStore((s) => s.map.collapsed.includes(nodeId));
  const folded = useMapStore((s) => (s.map.collapsed.includes(nodeId) ? hiddenAfter(s.map, nodeId) : 0));
  const direction = useMapStore((s) => s.map.direction);
  const toggleCollapsed = useMapStore((s) => s.toggleCollapsed);
  // Two different notes met here (`noteClashes`): the icon asks for a pick.
  const clash = useMapStore((s) => s.map.noteClashes?.[nodeId] !== undefined);
  const openNotes = useMapStore((s) => s.openNotes);
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
      data-connect-target={isTarget || isDropTarget || undefined}
      data-refused-target={isRefusedTarget || undefined}
      data-dropping={isDropping || undefined}
      data-drop-refused={isDropRefused || undefined}
      data-connect-source={isSource || undefined}
      data-cut={isCut || undefined}
      data-start={isStart || undefined}
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
        // Several lines pasted: an outline, one box per line.
        onPasteLines={(text, before, after) => pasteOutline(nodeId, text, before, after)}
        // Esc on a box just added takes it back; left blank otherwise, it stays.
        onDone={(committed) => stopEditing(!committed)}
        // Shift+Enter: a name over several lines (a linked map's are
        // Boardkit titles, one line).
        multiline={!isLinked}
        placeholder={isEditing ? "Type a name" : "Untitled"}
        ariaLabel="Box name"
        className={styles.name}
      />
      <Handle type="source" position={Position.Bottom} className={styles.handle} isConnectable={false} />

      {node.status && <StatusBadge status={node.status} />}

      {/* Notes: a small icon on the top-right corner says there are some;
          hovering shows their first lines. Both float, so notes never
          resize the box (Treekit's). */}
      {clash ? (
        <span
          className={`${styles.badge} ${styles.notesIcon}`}
          data-clash
          role="img"
          aria-label="Two different notes: open its notes to pick"
          title="Two different notes: open its notes to pick"
        >
          <StickyNote size={10} aria-hidden />
        </span>
      ) : (
        node.notes && (
          <>
            <span className={`${styles.badge} ${styles.notesIcon}`} role="img" aria-label="Has notes">
              <StickyNote size={10} aria-hidden />
            </span>
            <div className={styles.notesPreview} aria-hidden>
              <p className={styles.notesPreviewText}>{node.notes}</p>
            </div>
          </>
        )
      )}

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

      {/* Drag from here to another box to draw an arrow. A card in a
          linked tree has none: no arrow may start there (no next steps,
          and every other box already has its one way in). */}
      {(!isTree || addable) && (
        <span
          className={styles.dot}
          onPointerDown={onDotPointerDown}
          onDoubleClick={keepToButton}
          title="Drag to another box to connect"
          aria-hidden
        />
      )}

      <div className={styles.toolbar} onPointerDown={keepToButton} onDoubleClick={keepToButton}>
        {addable && (
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => addNextStep(nodeId)}
            aria-label="Add a child"
            title="Add a child"
          >
            <Plus size={14} />
          </button>
        )}
        <button type="button" className={styles.toolbarButton} onClick={rename} aria-label="Rename" title="Rename">
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className={styles.toolbarButton}
          onClick={() => openNotes(nodeId)}
          aria-label="Notes"
          title="Notes (N)"
        >
          <NotebookPen size={14} />
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
