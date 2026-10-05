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
 * Asks before deleting a tree box that takes other boxes with it (the
 * boxes only reachable through it). Opened by the store's `deleteBox`
 * through `confirmingDelete`, whichever way the delete was asked for (the
 * bin, the right-click menu, the Delete key).
 */
export function DeleteBranchDialog() {
  const pending = useMapStore((s) => s.confirmingDelete);
  const name = useMapStore((s) => (s.confirmingDelete ? s.map.nodes[s.confirmingDelete.id]?.name : undefined));
  const confirmDelete = useMapStore((s) => s.confirmDelete);
  const cancelDelete = useMapStore((s) => s.cancelDelete);
  // What the dialog asks about, kept while it fades out (by then the store
  // has already let go, and the words would change mid-fade).
  const [shown, setShown] = useState({ name, count: 0 });
  if (pending && (shown.name !== name || shown.count !== pending.count)) setShown({ name, count: pending.count });
  const others = shown.count - 1;

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && cancelDelete()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete “{shown.name || "Untitled"}” and {boxes(others)} after it?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The {others === 1 ? "box" : "boxes"} after it can only be reached through it, so{" "}
            {others === 1 ? "it goes" : "they go"} too. A box that another step also leads to stays. Undo brings them
            all back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirmDelete}>
            Delete {boxes(others + 1)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
