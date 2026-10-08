import { useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { canHaveNotes } from "../../domain/rules";
import { useMapStore } from "../../store/mapStore";
import styles from "./NotesPanel.module.css";

/**
 * The notes side panel (Treekit's): the selected box's name and a textarea
 * with its notes. Every keystroke saves; the store folds one stretch of
 * typing in one box into one undo step (see `setBoxNotes`).
 *
 * Non-modal (no overlay, the map stays usable) because the panel follows
 * the selection: clicking another box switches the panel to it. Clicking
 * anywhere else outside it, or Esc, closes it. It sits in a layer over the
 * map area only, so the header stays reachable while it is open.
 */
export function NotesPanel() {
  const nodeId = useMapStore((s) => s.selected);
  const isOpen = useMapStore((s) => s.notesOpen && s.selected !== null && !!s.map.nodes[s.selected] && canHaveNotes(s.map));
  const name = useMapStore((s) => (s.selected ? s.map.nodes[s.selected]?.name : undefined));
  const notes = useMapStore((s) => (s.selected ? (s.map.nodes[s.selected]?.notes ?? "") : ""));
  const setBoxNotes = useMapStore((s) => s.setBoxNotes);
  const closeNotes = useMapStore((s) => s.closeNotes);
  // The layer the sheet portals into; a state (not a ref) so the sheet
  // renders again once it exists.
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

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
              <SheetDescription>Notes save as you type.</SheetDescription>
            </SheetHeader>
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
