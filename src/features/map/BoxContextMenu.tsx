import { Pencil, Trash2 } from "lucide-react";
import { useRef, useState, type MouseEvent, type ReactElement } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import type { NodeId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { SwatchRow } from "./SwatchRow";
import { BOX_ID_ATTRIBUTE } from "./pageMarkers";

/**
 * The right-click menu for boxes: rename, colour, delete.
 *
 * One menu wraps the whole canvas rather than one per box (as in Treekit):
 * on right-click it looks up which box is under the pointer, so there is a
 * single menu however big the map grows. Right-clicking empty paper opens
 * nothing. While a name or label is being typed the menu stands aside, so
 * the browser's own menu (paste, spelling) still works in the field.
 *
 * `children` must be a single element: it becomes the trigger (`asChild`).
 */
export function BoxContextMenu({ children }: { readonly children: ReactElement }) {
  const [targetId, setTargetId] = useState<NodeId | null>(null);
  const isTyping = useMapStore((s) => s.editing !== null);
  // "Rename" puts focus in the name field, so it waits until the menu has
  // fully closed: while it animates out, the menu still holds focus and
  // would pull it straight back out of the field.
  const afterClose = useRef<(() => void) | null>(null);

  function onContextMenu(event: MouseEvent) {
    const box = (event.target as HTMLElement).closest(`[${BOX_ID_ATTRIBUTE}]`);
    const id = box?.getAttribute(BOX_ID_ATTRIBUTE) as NodeId | null | undefined;
    if (!id) {
      // Stops Radix opening the menu (it skips handlers after a
      // `preventDefault`); the browser's menu is suppressed too, as on
      // most canvas apps.
      event.preventDefault();
      return;
    }
    // Selected too, so it is obvious which box the menu is about.
    useMapStore.getState().select(id);
    setTargetId(id);
  }

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
        {targetId && <BoxMenuItems nodeId={targetId} runAfterClose={(action) => (afterClose.current = action)} />}
      </ContextMenuContent>
    </ContextMenu>
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

  return (
    <>
      <ContextMenuItem onSelect={() => runAfterClose(() => startEditing({ kind: "box", id: nodeId }))}>
        <Pencil aria-hidden />
        Rename
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuLabel>Colour</ContextMenuLabel>
      <SwatchRow value={color} onPick={(c) => setBoxColor(nodeId, c)} Item={ContextMenuItem} />
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => deleteBox(nodeId)}>
        <Trash2 aria-hidden />
        Delete box
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}
