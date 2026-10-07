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
import { BOARD_LIST_TRASH_LIMIT, BOARD_TRASH_LIMIT, type BoardErased } from "../../domain/bridge";
import { MAP_TRASH_LIMIT, TRASH_LIMIT } from "../../domain/trash";
import { useMapStore, type TrashWarning } from "../../store/mapStore";
import { ago, boxes, described } from "./ago";

const cards = (n: number) => `${n} card${n === 1 ? "" : "s"}`;

/** Boardkit's words for what its full trash would erase (its
    `describeErased`), plus how many more when one delete erases several. */
function boardErased(erased: readonly BoardErased[]): string {
  const [oldest] = erased;
  const title = oldest.title ? `, “${oldest.title}”` : "";
  const what =
    oldest.kind === "card"
      ? `the oldest card in it${title}`
      : `the oldest list in it${title}, with its ${cards(oldest.cards)}`;
  return erased.length > 1 ? `${what}, and ${erased.length - 1} more` : what;
}

/** What the dialog says: its first sentence, what goes, and its button. */
function wording(warning: TrashWarning): { holds: string; what: string; action: string; place: string } {
  if (warning.kind === "board") {
    const verb = { delete: "Delete", undo: "Undo", redo: "Redo" }[warning.action];
    return {
      holds: `Boardkit's trash holds ${BOARD_TRASH_LIMIT} cards and ${BOARD_LIST_TRASH_LIMIT} lists per board.`,
      what: `${verb === "Delete" ? "Deleting" : `${verb}ing`} this will permanently erase ${boardErased(warning.erased)}.`,
      action: `${verb} and erase the oldest`,
      place: "Boardkit's trash",
    };
  }
  const { erased } = warning;
  const isMap = warning.kind === "map";
  const what = isMap
    ? `the map “${erased.name || "Untitled map"}” (${boxes(erased.boxes)}), deleted ${ago(erased.deletedAt)}`
    : `${described(erased.name, erased.boxes)}, deleted ${ago(erased.deletedAt)}`;
  return {
    holds: `The trash holds ${isMap ? `${MAP_TRASH_LIMIT} maps` : `${TRASH_LIMIT} boxes per map`}.`,
    what: `Deleting this will permanently erase ${what}.`,
    action: "Delete and erase the oldest",
    place: "the trash",
  };
}

/**
 * Asks before a delete would push the oldest thing out of a full trash
 * (Boardkit's `TrashFullDialog`). Opened by the store's `trashWarning`,
 * whichever way the delete was asked for. In a linked map the trash is the
 * board's, in Boardkit, and an undo or redo can fill it too.
 */
export function TrashFullDialog() {
  const pending = useMapStore((s) => s.trashWarning);
  const confirm = useMapStore((s) => s.confirmTrashWarning);
  const cancel = useMapStore((s) => s.cancelTrashWarning);
  // What the dialog says, kept while it fades out (by then the store has
  // already let go).
  const [shown, setShown] = useState<TrashWarning | null>(pending);
  if (pending && pending !== shown) setShown(pending);
  const words = shown ? wording(shown) : null;

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && cancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>The trash is full</AlertDialogTitle>
          <AlertDialogDescription>
            {words?.holds} {words?.what} To keep it, cancel and restore or delete things in {words?.place} first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm}>
            {words?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
