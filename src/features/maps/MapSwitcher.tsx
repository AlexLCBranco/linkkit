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
import { exportAllMaps, restoreFrom } from "./backupFile";
import styles from "./MapSwitcher.module.css";

/**
 * The open map's name (click to rename) plus a menu to switch to another
 * saved map, start a new one, duplicate or delete this one, or add a fresh
 * example. Copied from Treekit's `TreeSwitcher`.
 *
 * "Add example map" replaces the prototype's "Reset example": it always
 * adds a new map, so it can never wipe one the user has worked on.
 *
 * "+ New tree" and "Add example tree" make decision trees (kind "tree").
 * A new tree opens its start box's name for typing.
 *
 * "Export all maps" downloads every map as one file; on an empty Linkkit
 * (only the untouched starter example) "Restore all maps from a file"
 * reads one back. That is how maps move to a new address (each address
 * has its own localStorage).
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
  const newTree = useMapStore((s) => s.newTree);
  const addExampleTree = useMapStore((s) => s.addExampleTree);
  const deleteMap = useMapStore((s) => s.deleteMap);
  // Empty: only the untouched starter example. Only then is restoring
  // offered, so a backup is never mixed into maps already in use.
  const empty = useMapStore((s) => s.maps.length === 1 && s.maps[0].id === s.starter);
  const filePicker = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<{ title: string; text: string } | null>(null);

  const [renaming, setRenaming] = useState(false);
  // Set by "New map", read as the menu closes (see `onCloseAutoFocus`).
  const focusNameAfterClose = useRef(false);
  // Set by "New tree": the tree is made once the menu has closed, so the
  // start box's name field can take the focus.
  const newTreeAfterClose = useRef(false);
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
            if (newTreeAfterClose.current) {
              newTreeAfterClose.current = false;
              event.preventDefault();
              newTree();
              return;
            }
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
          <DropdownMenuItem onSelect={() => (newTreeAfterClose.current = true)}>+ New tree</DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicateMap}>Duplicate this map</DropdownMenuItem>
          <DropdownMenuItem onSelect={addExampleMap}>Add example map</DropdownMenuItem>
          <DropdownMenuItem onSelect={addExampleTree}>Add example tree</DropdownMenuItem>
          <DropdownMenuItem disabled={maps.length <= 1} onSelect={() => setConfirmingDelete(true)}>
            Delete this map…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={exportAllMaps}>Export all maps</DropdownMenuItem>
          {empty && (
            <DropdownMenuItem onSelect={() => filePicker.current?.click()}>Restore all maps from a file…</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={filePicker}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared, so picking the same file again still counts as a change.
          e.target.value = "";
          if (file) void restoreFrom(file).then(setReport);
        }}
      />

      <AlertDialog open={report !== null} onOpenChange={(open) => !open && setReport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{report?.title}</AlertDialogTitle>
            <AlertDialogDescription>{report?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
