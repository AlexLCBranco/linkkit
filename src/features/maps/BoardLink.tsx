import { ExternalLink, Link2 } from "lucide-react";
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
import type { BoardChoice } from "../../domain/bridge";
import { useMapStore, type LinkPreview } from "../../store/mapStore";
import { openBoardNext } from "../../store/persistBoard";
import styles from "./BoardLink.module.css";

/** Boardkit on the shared site, where a linked map's board is: linking
    only happens there, next to Linkkit's /linkkit. */
export const BOARDKIT_URL = "/boardkit/";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "Link to Boardkit" (step 23): a tree that is shared with a Boardkit board
 * from then on, each change showing in both apps. Three pieces, all chrome
 * around the map (shadcn/ui dialogs, a CSS Module chip):
 *
 *  - `LinkDialog`, from the map menu: what linking will make, or which
 *    boxes are in the way (nothing is fixed automatically).
 *  - `UnlinkDialog`, from the map menu: the map becomes an ordinary tree,
 *    the board stays in Boardkit.
 *  - `BoardPickerDialog`, from the map menu: a new map made from a board
 *    already in Boardkit, linked from the start.
 *  - `LinkedChip`, next to the map's name while it is linked, with "Open in
 *    Boardkit" (which also makes it the board Boardkit opens).
 */
export function LinkDialog({ preview, onClose }: { preview: LinkPreview | null; onClose: () => void }) {
  const linkToBoard = useMapStore((s) => s.linkToBoard);
  const open = preview !== null && preview.kind !== "unavailable";

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        {preview?.kind === "refused" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>This map can't be a Boardkit board yet</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  <p>
                    A board has lists under its start and cards under the lists, and each card is in one list. Change
                    these first:
                  </p>
                  <ul className={styles.problems}>
                    {preview.problems.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction>OK</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : preview?.kind === "ok" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Link “{preview.name}” to Boardkit?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className={styles.body}>
                  <p>
                    It becomes a board in Boardkit with {count(preview.lists, "list", "lists")} and{" "}
                    {count(preview.cards, "card", "cards")}. From then on, a change in either app shows in both.
                  </p>
                  {preview.multiLine > 0 && (
                    <p>
                      {count(preview.multiLine, "name", "names")} over several lines will be put on one line: card
                      and list titles in Boardkit are one line.
                    </p>
                  )}
                  {preview.startStatus && (
                    <p>The start box's keep / maybe / cut will be left behind: a board in Boardkit has none.</p>
                  )}
                  {preview.trashKept > 0 && (
                    <p>
                      The {count(preview.trashKept, "deleted box", "deleted boxes")} in this map's trash will move to
                      Boardkit's trash, where you can restore them.
                    </p>
                  )}
                  {preview.trashLost > 0 && (
                    <p>
                      {count(preview.trashLost, "deleted box has", "deleted boxes have")} no place on a board (below a
                      card, or under a box that's gone for good), so linking will erase{" "}
                      {preview.trashLost === 1 ? "it" : "them"}.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => linkToBoard()}>Link</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UnlinkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const unlinkFromBoard = useMapStore((s) => s.unlinkFromBoard);
  const name = useMapStore((s) => s.map.name);
  // Notes of lists waiting in Boardkit's trash: an unlinked map can't
  // bring those lists back, so their notes would stay behind.
  const held = useMapStore((s) => Object.keys(s.map.heldNotes ?? {}).length);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unlink “{name}” from Boardkit?</AlertDialogTitle>
          <AlertDialogDescription>
            This map keeps its own copy, with tree rules still on, and the board stays in Boardkit as an ordinary board.
            From then on, changes in one no longer show in the other.
            {held > 0 &&
              ` ${held === 1 ? "One deleted list has" : `${held} deleted lists have`} a note kept for it while it waits in Boardkit's trash: restore ${held === 1 ? "it" : "them"} in Boardkit first, or that note is left behind.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={unlinkFromBoard}>Unlink</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * "Map from a Boardkit board…": Boardkit's boards, one row each, picked
 * like radio buttons; "Open as map" makes the linked map. A board that
 * can't be picked is greyed, with the reason on its row. `boards` is read
 * as the dialog opens (`null`: closed).
 */
export function BoardPickerDialog({ boards, onClose }: { boards: readonly BoardChoice[] | null; onClose: () => void }) {
  const openBoardAsMap = useMapStore((s) => s.openBoardAsMap);
  const [picked, setPicked] = useState<string | null>(null);
  const choosable = boards?.filter((b) => b.reason === null) ?? [];
  // The only board that can be picked is picked already.
  const chosen = picked ?? (choosable.length === 1 ? choosable[0].id : null);

  return (
    <AlertDialog
      open={boards !== null}
      onOpenChange={(next) => {
        if (next) return;
        setPicked(null);
        onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Open a Boardkit board as a map</AlertDialogTitle>
          <AlertDialogDescription>
            A new map with tree rules on, shared with the board: its lists become the next steps of the start, their cards
            the steps below. A change in either app shows in both. The board itself isn't changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {boards?.length === 0 ? (
          <p className={styles.boardInfo}>Boardkit has no boards yet.</p>
        ) : (
          <div className={styles.boards} role="radiogroup" aria-label="Boardkit boards">
            {boards?.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={b.id === chosen}
                disabled={b.reason !== null}
                className={styles.board}
                onClick={() => setPicked(b.id)}
                onDoubleClick={() => {
                  if (b.reason !== null) return;
                  setPicked(null);
                  onClose();
                  openBoardAsMap(b.id);
                }}
              >
                <span className={styles.boardName}>{b.name || "Untitled board"}</span>
                <span className={styles.boardInfo}>
                  {b.reason ?? `${count(b.lists, "list", "lists")} · ${count(b.cards, "card", "cards")}`}
                </span>
              </button>
            ))}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={chosen === null}
            onClick={() => {
              if (chosen === null) return;
              setPicked(null);
              openBoardAsMap(chosen);
            }}
          >
            Open as map
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function LinkedChip() {
  const boardId = useMapStore((s) => s.map.linkedBoard);
  if (!boardId) return null;

  return (
    <span className={styles.chip} title="This map is shared with a Boardkit board: a change in either app shows in both">
      <Link2 size={14} aria-hidden />
      <span className={styles.label}>Linked to Boardkit</span>
      <a
        className={styles.open}
        href={BOARDKIT_URL}
        target="_blank"
        rel="noopener"
        onClick={() => openBoardNext(boardId)}
      >
        Open in Boardkit
        <ExternalLink size={12} aria-hidden />
      </a>
    </span>
  );
}
