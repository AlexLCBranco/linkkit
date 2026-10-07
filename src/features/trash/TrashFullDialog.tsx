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
import { MAP_TRASH_LIMIT, TRASH_LIMIT } from "../../domain/trash";
import { useMapStore, type TrashWarning } from "../../store/mapStore";
import { ago, boxes, described } from "./ago";

/**
 * Asks before a delete would push the oldest thing out of a full trash
 * (Boardkit's `TrashFullDialog`). Opened by the store's `trashWarning`,
 * whichever way the delete was asked for.
 */
export function TrashFullDialog() {
  const pending = useMapStore((s) => s.trashWarning);
  const confirm = useMapStore((s) => s.confirmTrashWarning);
  const cancel = useMapStore((s) => s.cancelTrashWarning);
  // What the dialog says, kept while it fades out (by then the store has
  // already let go).
  const [shown, setShown] = useState<TrashWarning | null>(pending);
  if (pending && pending !== shown) setShown(pending);

  const isMap = shown?.kind === "map";
  const erased = shown?.erased;
  const what = !erased
    ? ""
    : isMap
      ? `the map “${erased.name || "Untitled map"}” (${boxes(erased.boxes)}), deleted ${ago(erased.deletedAt)}`
      : `${described(erased.name, erased.boxes)}, deleted ${ago(erased.deletedAt)}`;

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && cancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>The trash is full</AlertDialogTitle>
          <AlertDialogDescription>
            The trash holds {isMap ? `${MAP_TRASH_LIMIT} maps` : `${TRASH_LIMIT} boxes per map`}. Deleting this will
            permanently erase {what}. To keep it, cancel and restore or delete things in the trash first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm}>
            Delete and erase the oldest
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
