import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { InlineEditable } from "../../components/InlineEditable";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useMapStore } from "../../store/mapStore";
import styles from "./MapSwitcher.module.css";

/**
 * The open map's name (click to rename) plus a menu to switch to another
 * saved map, start a new one, duplicate or delete this one, or add a fresh
 * example. Copied from Treekit's `TreeSwitcher`.
 *
 * "Add example map" replaces the prototype's "Reset example": it always
 * adds a new map, so it can never wipe one the user has worked on.
 *
 * The menu and the confirm dialog are shadcn/ui: supporting chrome, not the
 * page, which is where CLAUDE.md draws the line. Their colours still come
 * from tokens.css through the bridge in global.css.
 */
export function MapSwitcher() {
  const mapId = useMapStore((s) => s.map.id);
  const name = useMapStore((s) => s.map.name);
  const maps = useMapStore((s) => s.maps);
  const renameMap = useMapStore((s) => s.renameMap);
  const switchMap = useMapStore((s) => s.switchMap);
  const newMap = useMapStore((s) => s.newMap);
  const duplicateMap = useMapStore((s) => s.duplicateMap);
  const addExampleMap = useMapStore((s) => s.addExampleMap);
  const deleteMap = useMapStore((s) => s.deleteMap);

  const [renaming, setRenaming] = useState(false);
  // Set by "New map", read as the menu closes (see `onCloseAutoFocus`).
  const focusNameAfterClose = useRef(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Stored oldest-first; listed newest-first, so the latest map is always at
  // the top however many have piled up.
  const newestFirst = useMemo(() => [...maps].reverse(), [maps]);

  return (
    <div className={styles.switcher}>
      {renaming ? (
        <InlineEditable
          value={name}
          editing
          // The store ignores an emptied name: a map always needs one for
          // the list.
          onCommit={renameMap}
          onDone={() => setRenaming(false)}
          ariaLabel="Map name"
          className={styles.name}
        />
      ) : (
        <button type="button" className={styles.name} onClick={() => setRenaming(true)} title="Rename map">
          {name}
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={styles.trigger} aria-label="Switch map" title="Your maps">
            <ChevronDown size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-56"
          // After "New map", the name field opens only once the menu has
          // fully closed. Opened any earlier, the menu (which keeps focus
          // inside itself while open) pulls focus straight back, and the
          // typed name goes to the menu instead. Focus would also normally
          // return to the trigger here, so that is skipped.
          onCloseAutoFocus={(event) => {
            if (!focusNameAfterClose.current) return;
            focusNameAfterClose.current = false;
            event.preventDefault();
            setRenaming(true);
          }}
        >
          {newestFirst.map((m) => (
            <DropdownMenuItem key={m.id} onSelect={() => switchMap(m.id)}>
              <span className={styles.check}>{m.id === mapId ? "✓" : ""}</span>
              {m.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              newMap();
              // Straight into naming it, like a new box.
              focusNameAfterClose.current = true;
            }}
          >
            + New map
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicateMap}>Duplicate this map</DropdownMenuItem>
          <DropdownMenuItem onSelect={addExampleMap}>Add example map</DropdownMenuItem>
          <DropdownMenuItem disabled={maps.length <= 1} onSelect={() => setConfirmingDelete(true)}>
            Delete this map…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>The whole map is deleted for good. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteMap(mapId)}>
              Delete map
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
