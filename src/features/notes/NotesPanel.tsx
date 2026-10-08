import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { noteHome } from "../../domain/bridge";
import type { NodeId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { useSyncNotice } from "../../store/syncNotice";
import styles from "./NotesPanel.module.css";

/** What the panel says about where the note is kept. */
const WHERE: Readonly<Record<ReturnType<typeof noteHome>, string>> = {
  map: "Notes save as you type.",
  card: "Shared with Boardkit as this card's pregame thots. Saves as you type.",
  linkkit: "Kept in Linkkit only: Boardkit has no place for it. Saves as you type.",
};

/**
 * The notes side panel (Treekit's): the selected box's name and a textarea
 * with its notes. Every keystroke saves; the store folds one stretch of
 * typing in one box into one undo step (see `setBoxNotes`).
 *
 * Non-modal (no overlay, the map stays usable) because the panel follows
 * the selection: clicking another box switches the panel to it. Clicking
 * anywhere else outside it, or Esc, closes it. It sits in a layer over the
 * map area only, so the header stays reachable while it is open.
 *
 * In a map linked to Boardkit a card's note is its pregame thots; the
 * start's and lists' are Linkkit's alone (owner's plan B). Where two
 * different texts met (`noteClashes`), the panel shows both and nothing
 * is overwritten until the user picks (`ClashPicker`).
 */
export function NotesPanel() {
  const nodeId = useMapStore((s) => s.selected);
  const isOpen = useMapStore((s) => s.notesOpen && s.selected !== null && !!s.map.nodes[s.selected]);
  const name = useMapStore((s) => (s.selected ? s.map.nodes[s.selected]?.name : undefined));
  const notes = useMapStore((s) => (s.selected ? (s.map.nodes[s.selected]?.notes ?? "") : ""));
  const where = useMapStore((s) => (s.selected ? noteHome(s.map, s.selected) : "map"));
  const setBoxNotes = useMapStore((s) => s.setBoxNotes);
  const closeNotes = useMapStore((s) => s.closeNotes);
  // The layer the sheet portals into; a state (not a ref) so the sheet
  // renders again once it exists.
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  useClashNotice();

  return (
    <div ref={setLayer} className={styles.layer}>
      {layer && (
        <Sheet open={isOpen} onOpenChange={(open) => !open && closeNotes()} modal={false}>
          <SheetContent
            container={layer}
            overlay={false}
            className="absolute pointer-events-auto gap-0"
            // Clicking a box is not "outside": it selects that box, and
            // the panel switches to it.
            onInteractOutside={(event) => {
              const target = event.target as HTMLElement | null;
              if (target?.closest(".react-flow__node")) event.preventDefault();
            }}
            // Esc only closes the panel: stopped here so the map does not
            // also treat it as "clear the selection".
            onEscapeKeyDown={(event) => event.stopPropagation()}
            // Back to the page, so the map's keys work straight away.
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <SheetHeader className="pr-10">
              <SheetTitle className="break-words">{name || "Untitled"}</SheetTitle>
              <SheetDescription>{WHERE[where]}</SheetDescription>
            </SheetHeader>
            {nodeId && <ClashPicker nodeId={nodeId} />}
            {nodeId && (
              <textarea
                // Remounts per box, so the caret and the textarea's own
                // undo never carry over from another box's notes.
                key={nodeId}
                className={styles.textarea}
                value={notes}
                onChange={(event) => setBoxNotes(nodeId, event.target.value)}
                placeholder="Write notes for this box…"
                aria-label="Notes"
                spellCheck
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

/**
 * Two different notes met on this box: both are shown, and the user picks
 * one, or both (joined). Until then the note shows (and Boardkit keeps)
 * the first; the second waits here, never overwritten.
 */
function ClashPicker({ nodeId }: { readonly nodeId: NodeId }) {
  const aside = useMapStore((s) => s.map.noteClashes?.[nodeId]);
  const note = useMapStore((s) => s.map.nodes[nodeId]?.notes ?? "");
  const linked = useMapStore((s) => !!s.map.linkedBoard);
  const resolve = useMapStore((s) => s.resolveNoteClash);
  if (aside === undefined) return null;
  const [first, second] = linked ? ["Boardkit (pregame thots)", "Kept in Linkkit"] : ["This note", "Kept aside"];
  return (
    <section className={styles.clash} aria-label="Two different notes">
      <p className={styles.clashTitle}>This box has two different notes. Pick what to keep; nothing is lost until you do.</p>
      <div className={styles.clashTexts}>
        <figure className={styles.clashText}>
          <figcaption>{first}</figcaption>
          <p>{note || "(empty)"}</p>
        </figure>
        <figure className={styles.clashText}>
          <figcaption>{second}</figcaption>
          <p>{aside}</p>
        </figure>
      </div>
      <div className={styles.clashButtons}>
        <Button size="sm" variant="outline" onClick={() => resolve(nodeId, "note")}>
          {linked ? "Use Boardkit's" : "Use this note"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => resolve(nodeId, "aside")}>
          {linked ? "Use Linkkit's" : "Use the one kept aside"}
        </Button>
        <Button size="sm" onClick={() => resolve(nodeId, "both")}>
          Keep both
        </Button>
      </div>
    </section>
  );
}

/** Says once, when a map opens (or a new clash arrives), how many boxes
    have two different notes waiting for a pick. */
function useClashNotice() {
  const mapId = useMapStore((s) => s.map.id);
  const count = useMapStore((s) => Object.keys(s.map.noteClashes ?? {}).length);
  const seen = useRef<{ mapId: string; count: number } | null>(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = { mapId, count };
    if (count === 0 || (before?.mapId === mapId && before.count >= count)) return;
    const boxes = count === 1 ? "One box has" : `${count} boxes have`;
    useSyncNotice
      .getState()
      .say(`${boxes} two different notes (Linkkit's and Boardkit's pregame thots). Its orange note icon opens them to pick.`);
  }, [mapId, count]);
}
