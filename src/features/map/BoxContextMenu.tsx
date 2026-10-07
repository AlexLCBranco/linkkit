import { useReactFlow } from "@xyflow/react";
import { ChevronsDownUp, ChevronsUpDown, ClipboardPaste, Copy, CopyPlus, Pencil, Plus, Scissors, Trash2 } from "lucide-react";
import { useRef, useState, type MouseEvent, type ReactElement } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import { canAddNextStep, canCollapse, canDeleteBox, canPaste, canSetStatus } from "../../domain/rules";
import type { NodeId, Point } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { selectGroupColor, selectGroupStatus } from "../../store/selectors";
import { StatusRow } from "./StatusRow";
import { SwatchRow } from "./SwatchRow";
import { BOX_ID_ATTRIBUTE } from "./pageMarkers";

/** What the menu is about: one box, the picked group, or empty paper (where
    it only offers to paste, at the spot clicked). */
type Target =
  | { readonly kind: "box"; readonly id: NodeId }
  | { readonly kind: "group" }
  | { readonly kind: "paper"; readonly at: Point };

/**
 * The right-click menu. On a box: rename, copy, duplicate, colour, delete
 * (in a tree, also "Add next step" and keep / maybe / cut; the start has
 * neither a status nor delete, and nothing is copied). On a box that is one of several picked: the same for the whole
 * group. On empty paper: "Paste here", once something has been copied.
 *
 * One menu wraps the whole canvas rather than one per box (as in Treekit):
 * on right-click it looks up which box is under the pointer, so there is a
 * single menu however big the map grows. Right-clicking empty paper with
 * nothing to paste opens nothing. While a name or label is being typed the
 * menu stands aside, so the browser's own menu (paste, spelling) still
 * works in the field.
 *
 * `children` must be a single element: it becomes the trigger (`asChild`).
 */
export function BoxContextMenu({ children }: { readonly children: ReactElement }) {
  const [target, setTarget] = useState<Target | null>(null);
  const isTyping = useMapStore((s) => s.editing !== null);
  const { screenToFlowPosition } = useReactFlow();
  // "Rename" puts focus in the name field, so it waits until the menu has
  // fully closed: while it animates out, the menu still holds focus and
  // would pull it straight back out of the field.
  const afterClose = useRef<(() => void) | null>(null);

  function onContextMenu(event: MouseEvent) {
    const store = useMapStore.getState();
    const box = (event.target as HTMLElement).closest(`[${BOX_ID_ATTRIBUTE}]`);
    const id = box?.getAttribute(BOX_ID_ATTRIBUTE) as NodeId | null | undefined;
    if (id && store.group.includes(id)) {
      setTarget({ kind: "group" });
    } else if (id) {
      // Selected too, so it is obvious which box the menu is about.
      store.select(id);
      setTarget({ kind: "box", id });
    } else if (store.clipboard && canPaste(store.map)) {
      setTarget({ kind: "paper", at: screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
    } else {
      // Stops Radix opening the menu (it skips handlers after a
      // `preventDefault`); the browser's menu is suppressed too, as on
      // most canvas apps.
      event.preventDefault();
    }
  }

  const runAfterClose = (action: () => void) => {
    afterClose.current = action;
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={isTyping} onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-auto"
        // Focus falls back to the page, not the canvas wrapper, so the
        // keys keep working after the menu closes.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const action = afterClose.current;
          afterClose.current = null;
          action?.();
        }}
      >
        {target?.kind === "box" && <BoxMenuItems nodeId={target.id} runAfterClose={runAfterClose} />}
        {target?.kind === "group" && <GroupMenuItems />}
        {target?.kind === "paper" && <PaperMenuItems at={target.at} />}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Duplicate, Copy (and Cut), where the map's rules allow pasting: not in
    a tree. `ids` is read when picked, so it is the selection as it is then. */
function CopyItems({ ids, cut = false }: { readonly ids: () => readonly NodeId[]; readonly cut?: boolean }) {
  const pastable = useMapStore((s) => canPaste(s.map));
  if (!pastable) return null;
  const { copyBoxes, cutBoxes, duplicateBoxes } = useMapStore.getState();
  return (
    <>
      <ContextMenuItem onSelect={() => duplicateBoxes(ids())}>
        <CopyPlus aria-hidden />
        Duplicate
        <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => copyBoxes(ids())}>
        <Copy aria-hidden />
        Copy
        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
      </ContextMenuItem>
      {cut && (
        <ContextMenuItem onSelect={() => cutBoxes(ids())}>
          <Scissors aria-hidden />
          Cut
          <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
      )}
    </>
  );
}

/** "Collapse branch" / "Expand branch" for boxes with next steps (all of a
    group: collapsed together, or expanded if all are). Nothing when none
    has next steps. */
function CollapseItem({ ids }: { readonly ids: () => readonly NodeId[] }) {
  const { foldable, folded, many } = useMapStore(
    useShallow((s) => {
      const withSteps = ids().filter((id) => canCollapse(s.map, id));
      return {
        foldable: withSteps.length,
        folded: withSteps.length > 0 && withSteps.every((id) => s.map.collapsed.includes(id)),
        many: withSteps.length > 1,
      };
    }),
  );
  if (foldable === 0) return null;
  const noun = many ? "branches" : "branch";
  return (
    <ContextMenuItem onSelect={() => useMapStore.getState().toggleCollapsed(ids())}>
      {folded ? <ChevronsUpDown aria-hidden /> : <ChevronsDownUp aria-hidden />}
      {folded ? `Expand ${noun}` : `Collapse ${noun}`}
      <ContextMenuShortcut>Space</ContextMenuShortcut>
    </ContextMenuItem>
  );
}

function BoxMenuItems({
  nodeId,
  runAfterClose,
}: {
  readonly nodeId: NodeId;
  readonly runAfterClose: (action: () => void) => void;
}) {
  const color = useMapStore((s) => s.map.nodes[nodeId]?.color ?? null);
  const startEditing = useMapStore((s) => s.startEditing);
  const setBoxColor = useMapStore((s) => s.setBoxColor);
  const deleteBox = useMapStore((s) => s.deleteBox);
  const addNextStep = useMapStore((s) => s.addNextStep);
  const addable = useMapStore((s) => canAddNextStep(s.map, nodeId));
  const deletable = useMapStore((s) => canDeleteBox(s.map, nodeId));
  const status = useMapStore((s) => s.map.nodes[nodeId]?.status ?? null);
  const statusable = useMapStore((s) => canSetStatus(s.map, nodeId));
  const setBoxesStatus = useMapStore((s) => s.setBoxesStatus);

  return (
    <>
      {addable && (
        // Waits for the menu to close, like Rename: the new box's name
        // field needs the focus.
        <ContextMenuItem onSelect={() => runAfterClose(() => addNextStep(nodeId))}>
          <Plus aria-hidden />
          Add next step
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => runAfterClose(() => startEditing({ kind: "box", id: nodeId }))}>
        <Pencil aria-hidden />
        Rename
      </ContextMenuItem>
      <CollapseItem ids={() => [nodeId]} />
      <CopyItems ids={() => [nodeId]} />
      {statusable && (
        <>
          <ContextMenuSeparator />
          <ContextMenuLabel>Status</ContextMenuLabel>
          <StatusRow value={status} onPick={(next) => setBoxesStatus([nodeId], next)} Item={ContextMenuItem} />
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuLabel>Colour</ContextMenuLabel>
      <SwatchRow value={color} onPick={(c) => setBoxColor(nodeId, c)} Item={ContextMenuItem} />
      {deletable && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => deleteBox(nodeId)}>
            <Trash2 aria-hidden />
            Delete box
            <ContextMenuShortcut>Del</ContextMenuShortcut>
          </ContextMenuItem>
        </>
      )}
    </>
  );
}

function GroupMenuItems() {
  const count = useMapStore((s) => s.group.length);
  const color = useMapStore(selectGroupColor);
  const deletable = useMapStore((s) => s.group.some((id) => canDeleteBox(s.map, id)));
  const status = useMapStore(selectGroupStatus);
  const statusable = useMapStore((s) => s.group.some((id) => canSetStatus(s.map, id)));
  const { setBoxesColor, setBoxesStatus, deleteBoxes } = useMapStore.getState();
  // Read at click time, so an action always gets the group as it is now.
  const group = () => useMapStore.getState().group;

  return (
    <>
      <ContextMenuLabel>{count} boxes</ContextMenuLabel>
      <CopyItems ids={group} cut />
      <CollapseItem ids={group} />
      {statusable && (
        <>
          <ContextMenuSeparator />
          <ContextMenuLabel>Status</ContextMenuLabel>
          <StatusRow value={status} onPick={(next) => setBoxesStatus(group(), next)} Item={ContextMenuItem} />
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuLabel>Colour</ContextMenuLabel>
      <SwatchRow value={color} onPick={(c) => setBoxesColor(group(), c)} Item={ContextMenuItem} />
      {deletable && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => deleteBoxes(group())}>
            <Trash2 aria-hidden />
            Delete {count} boxes
            <ContextMenuShortcut>Del</ContextMenuShortcut>
          </ContextMenuItem>
        </>
      )}
    </>
  );
}

function PaperMenuItems({ at }: { readonly at: Point }) {
  const count = useMapStore((s) => s.clipboard?.fragment.nodes.length ?? 0);
  return (
    <ContextMenuItem onSelect={() => useMapStore.getState().paste(at)}>
      <ClipboardPaste aria-hidden />
      {count === 1 ? "Paste box here" : `Paste ${count} boxes here`}
      <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
    </ContextMenuItem>
  );
}
