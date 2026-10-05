import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { useMapStore } from "../../store/mapStore";

const boxes = (n: number) => `${n} ${n === 1 ? "box" : "boxes"}`;

/**
 * Asks before deleting a tree box (or several picked together) that takes
 * other boxes with it (the boxes only reachable through it). Opened by the
 * store's `deleteBoxes` through `confirmingDelete`, whichever way the
 * delete was asked for (the bin, the right-click menu, the selection bar,
 * the Delete key).
 */
export function DeleteBranchDialog() {
  const pending = useMapStore((s) => s.confirmingDelete);
  // One box: its name. Several: how many were picked.
  const name = useMapStore((s) =>
    s.confirmingDelete?.ids.length === 1 ? s.map.nodes[s.confirmingDelete.ids[0]]?.name : undefined,
  );
  const picked = useMapStore((s) => s.confirmingDelete?.ids.length ?? 0);
  const confirmDelete = useMapStore((s) => s.confirmDelete);
  const cancelDelete = useMapStore((s) => s.cancelDelete);
  // What the dialog asks about, kept while it fades out (by then the store
  // has already let go, and the words would change mid-fade).
  const [shown, setShown] = useState({ name, picked: 1, count: 0 });
  if (pending && (shown.name !== name || shown.count !== pending.count || shown.picked !== picked)) {
    setShown({ name, picked, count: pending.count });
  }
  const others = shown.count - shown.picked;
  const several = shown.picked > 1;

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && cancelDelete()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {several
              ? `Delete ${boxes(shown.picked)} and ${boxes(others)} after them?`
              : `Delete “${shown.name || "Untitled"}” and ${boxes(others)} after it?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            The {others === 1 ? "box" : "boxes"} after {several ? "them" : "it"} can only be reached through{" "}
            {several ? "them" : "it"}, so{" "}
            {others === 1 ? "it goes" : "they go"} too. A box that another step also leads to stays. Undo brings them
            all back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirmDelete}>
            Delete {boxes(shown.count)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
