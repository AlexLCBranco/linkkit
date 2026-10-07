import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { InlineEditable } from "../../components/InlineEditable";
import {
  AlertDialog,
  AlertDialogAction,
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
import { backupNeedsAttention, backupStopped } from "../../domain/autoBackup";
import { displayNames } from "../../domain/names";
import { useBackupStore } from "../../store/backupStore";
import { hasBoardList } from "../../store/persistBoard";
import { linkPreview, useMapStore, type LinkPreview } from "../../store/mapStore";
import { LinkDialog, UnlinkDialog } from "./BoardLink";
import { TemplateGallery } from "./TemplateGallery";
import { useTemplates } from "../../store/templates";
import { BackupMenuItems } from "./BackupMenuItems";
import { exportAllMaps, restoreFrom } from "./backupFile";
import styles from "./MapSwitcher.module.css";
import { useNow } from "./useNow";

/**
 * The open map's name (click to rename) plus a menu to switch to another
 * saved map, start a new one, duplicate or delete this one, or add a fresh
 * example. Copied from Treekit's `TreeSwitcher`.
 *
 * "Add example map" replaces the prototype's "Reset example": it always
 * adds a new map, so it can never wipe one the user has worked on.
 *
 * "+ New map with tree rules" and "Add example map with tree rules" make
 * decision trees (kind "tree"). The UI calls every kind a map; a tree is a
 * map with tree rules on (the owner's wording, usability pass U3).
 * A new tree opens its start box's name for typing.
 *
 * "Export all maps" downloads every map as one file; on an empty Linkkit
 * (only the untouched starter example) "Restore all maps from a file"
 * reads one back. That is how maps move to a new address (each address
 * has its own localStorage).
 *
 * "Link to Boardkit…" (trees, where Boardkit's data is) and "Unlink from
 * Boardkit…" (linked trees) open their questions in `BoardLink.tsx`.
 *
 * "Delete this map" moves it to the trash (see TrashPanel), so it doesn't
 * ask first.
 *
 * The menu and the report dialog are shadcn/ui: supporting chrome, not the
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
  const isTree = useMapStore((s) => s.map.kind === "tree");
  const linked = useMapStore((s) => !!s.map.linkedBoard);
  // Asked as the menu opens: Boardkit may have been opened since.
  const [boardkitHere, setBoardkitHere] = useState(false);
  const [linking, setLinking] = useState<LinkPreview | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [templates, setTemplates] = useState(false);
  // Empty: only the untouched starter example. Only then is restoring
  // offered, so a backup is never mixed into maps already in use.
  const empty = useMapStore((s) => s.maps.length === 1 && s.maps[0].id === s.starter);
  // A dot on the button when backups need the user: automatic backup has
  // stopped (it never stops silently), or, without it, nothing has been
  // backed up for 7 days. The minute clock lets the dot appear on a page
  // left open.
  const backupStatus = useBackupStore((s) => s.status);
  const lastBackupAt = useBackupStore((s) => s.lastBackupAt);
  const now = useNow(60_000);
  const stopped = backupStopped(backupStatus);
  const attention = backupNeedsAttention({ status: backupStatus, lastBackupAt, now, empty });
  const triggerNote = stopped
    ? "automatic backup has stopped"
    : !attention
      ? null
      : lastBackupAt === null
        ? "no backup yet"
        : "no backup for over 7 days";
  const filePicker = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<{ title: string; text: string } | null>(null);

  const [renaming, setRenaming] = useState(false);
  // Set by "New map", read as the menu closes (see `onCloseAutoFocus`).
  const focusNameAfterClose = useRef(false);
  // Set by "New tree": the tree is made once the menu has closed, so the
  // start box's name field can take the focus.
  const newTreeAfterClose = useRef(false);
  // Stored oldest-first; listed newest-first, so the latest map is always at
  // the top however many have piled up.
  const newestFirst = useMemo(() => [...maps].reverse(), [maps]);
  // Two maps never show the same name: a repeat shows as "Rent 2" (U11).
  const shown = useMemo(() => displayNames(maps), [maps]);

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
          {shown.get(mapId) ?? name}
        </button>
      )}

      <DropdownMenu onOpenChange={(open) => open && setBoardkitHere(hasBoardList())}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={styles.trigger}
            aria-label={triggerNote ? `Switch map (${triggerNote})` : "Switch map"}
            title={triggerNote ? `Your maps · ${triggerNote}` : "Your maps"}
          >
            <ChevronDown size={14} />
            {attention && <span className={styles.dot} />}
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
              {shown.get(m.id) ?? m.name}
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
          <DropdownMenuItem onSelect={() => (newTreeAfterClose.current = true)}>+ New map with tree rules</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTemplates(true)}>New from template…</DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicateMap}>Duplicate this map</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => useTemplates.getState().save(useMapStore.getState().map)}>
            Save this map as a template
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={addExampleMap}>Add example map</DropdownMenuItem>
          <DropdownMenuItem onSelect={addExampleTree}>Add example map with tree rules</DropdownMenuItem>
          {isTree && !linked && boardkitHere && (
            <DropdownMenuItem onSelect={() => setLinking(linkPreview(useMapStore.getState().map))}>
              Link to Boardkit…
            </DropdownMenuItem>
          )}
          {linked && <DropdownMenuItem onSelect={() => setUnlinking(true)}>Unlink from Boardkit…</DropdownMenuItem>}
          {/* No question asked: the map goes to the trash, to restore from there. */}
          <DropdownMenuItem disabled={maps.length <= 1} onSelect={() => deleteMap(mapId)}>
            Delete this map
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={exportAllMaps}>Export all maps</DropdownMenuItem>
          <BackupMenuItems />
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

      <LinkDialog preview={linking} onClose={() => setLinking(null)} />
      <UnlinkDialog open={unlinking} onClose={() => setUnlinking(false)} />
      <TemplateGallery open={templates} onOpenChange={setTemplates} />

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
    </div>
  );
}
