import { ExternalLink, RotateCcw, Trash2, X } from "lucide-react";
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
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { trashEntryId, type TrashedMap } from "../../domain/trash";
import type { NodeId, TrashEntry } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { ago, boxes, described } from "./ago";
import styles from "./TrashPanel.module.css";

/** Boardkit on the shared site, where a linked map's board is: linking
    only happens there, next to Linkkit's /linkkit. */
const BOARDKIT_URL = "/boardkit/";

const maps = (n: number) => `${n} ${n === 1 ? "map" : "maps"}`;

/**
 * Where deleted boxes and maps go instead of vanishing (Treekit's trash
 * button, holding what Boardkit's trash holds): a header button that opens
 * a list to restore from, delete for good, or empty. Chrome around the
 * map, so shadcn/ui dialogs; the button itself is a CSS Module like the
 * other header buttons.
 *
 * "From this map" is the open map's own trash; "Deleted maps" is shared by
 * every map. A map linked to Boardkit has no trash of its own: its deleted
 * boxes are in the board's trash, so the panel points there instead.
 */
export function TrashPanel() {
  const trash = useMapStore((s) => s.map.trash);
  const linked = useMapStore((s) => s.map.linkedBoard !== undefined);
  const trashedMaps = useMapStore((s) => s.trashedMaps);
  const emptyTrash = useMapStore((s) => s.emptyTrash);
  // Closing the dialog before a restore puts the focus back on the page.
  const [open, setOpen] = useState(false);
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  const count = trash.length + trashedMaps.length;
  const trashedBoxes = trash.reduce((n, e) => n + e.nodes.length, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button type="button" className={styles.trigger} aria-label="Recently deleted" title="Recently deleted">
            <Trash2 size={16} />
            {count > 0 && <span className={styles.count}>{count}</span>}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recently deleted</DialogTitle>
            <DialogDescription>
              Deleted boxes and maps wait here until you restore them or delete them for good.
            </DialogDescription>
          </DialogHeader>
          {linked && (
            <section className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                This map is shared with Boardkit: its deleted boxes are in Boardkit's trash.
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href={BOARDKIT_URL} target="_blank" rel="noopener">
                  <ExternalLink />
                  Open trash in Boardkit
                </a>
              </Button>
            </section>
          )}
          {count === 0 ? (
            !linked && 
            <p className="py-2 text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <>
              <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
                {trash.length > 0 && (
                  <section>
                    <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">From this map</h3>
                    <ul className="flex flex-col gap-1">
                      {[...trash].reverse().map((entry) => (
                        <BoxesRow key={trashEntryId(entry)} entry={entry} onRestored={() => setOpen(false)} />
                      ))}
                    </ul>
                  </section>
                )}
                {trashedMaps.length > 0 && (
                  <section>
                    <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">Deleted maps</h3>
                    <ul className="flex flex-col gap-1">
                      {[...trashedMaps].reverse().map((m) => (
                        <MapRow key={m.id} trashed={m} onRestored={() => setOpen(false)} />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setConfirmingEmpty(true)}>
                  Empty trash
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmingEmpty} onOpenChange={setConfirmingEmpty}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty the trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {[
                trashedBoxes > 0 && `${boxes(trashedBoxes)} deleted from this map`,
                trashedMaps.length > 0 && maps(trashedMaps.length),
              ]
                .filter(Boolean)
                .join(" and ")}{" "}
              will be erased for good.
              {trashedMaps.length > 0 && " Undo can't bring deleted maps back."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={emptyTrash}>
              Empty trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({
  title,
  detail,
  what,
  onRestore,
  onErase,
}: {
  readonly title: string;
  readonly detail: string;
  readonly what: string;
  readonly onRestore: () => void;
  readonly onErase: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`Restore ${what}`} title="Restore" onClick={onRestore}>
        <RotateCcw />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${what} for good`} title="Delete for good" onClick={onErase}>
        <X />
      </Button>
    </li>
  );
}

function BoxesRow({ entry, onRestored }: { readonly entry: TrashEntry; readonly onRestored: () => void }) {
  const restoreBoxes = useMapStore((s) => s.restoreBoxes);
  const forgetBoxes = useMapStore((s) => s.forgetBoxes);
  const id: NodeId = trashEntryId(entry);
  return (
    <Row
      title={described(entry.nodes[0].name, entry.nodes.length)}
      detail={`${boxes(entry.nodes.length)} · ${ago(entry.deletedAt)}`}
      what={entry.nodes.length === 1 ? "box" : "boxes"}
      onRestore={() => {
        restoreBoxes(id);
        onRestored();
      }}
      onErase={() => forgetBoxes(id)}
    />
  );
}

function MapRow({ trashed, onRestored }: { readonly trashed: TrashedMap; readonly onRestored: () => void }) {
  const restoreMap = useMapStore((s) => s.restoreMap);
  const eraseMap = useMapStore((s) => s.eraseMap);
  return (
    <Row
      title={trashed.name || "Untitled map"}
      detail={`${boxes(trashed.boxes)} · ${ago(trashed.deletedAt)}`}
      what="map"
      onRestore={() => {
        restoreMap(trashed.id);
        onRestored();
      }}
      onErase={() => eraseMap(trashed.id)}
    />
  );
}
