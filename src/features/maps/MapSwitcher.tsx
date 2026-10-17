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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { BRACKET_SIZES, type BracketSize } from "../../domain/bracket";
import { backupNeedsAttention, backupStopped } from "../../domain/autoBackup";
import { mapMenuList, RECENT_MAPS } from "../../domain/mapMenu";
import { displayNames } from "../../domain/names";
import type { MapId } from "../../domain/types";
import { useBackupStore } from "../../store/backupStore";
import { hasBoardList } from "../../store/persistBoard";
import type { BoardChoice } from "../../domain/bridge";
import { boardChoices, linkPreview, useMapStore, type LinkPreview } from "../../store/mapStore";
import { BoardPickerDialog, LinkDialog, UnlinkDialog } from "./BoardLink";
import { TemplateGallery } from "./TemplateGallery";
import { useGallery } from "../../store/gallery";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { BackupMenuItems } from "./BackupMenuItems";
import { exportAllMaps, restoreFrom } from "./backupFile";
import { KindHelp } from "./KindHelp";
import { NEW_MAP_HELP } from "./newMapHelp";
import { MapSearch } from "./MapSearch";
import styles from "./MapSwitcher.module.css";
import { useNow } from "./useNow";

/**
 * The open map's name (click to rename) plus a menu to switch to another
 * saved map, start a new one (blank or from a template), duplicate or
 * delete this one. Copied from Treekit's `TreeSwitcher`.
 *
 * The menu is the map list, then three submenus: "+ New ▸" (every kind),
 * "This map ▸" and "Backup ▸" (the owner's pick, 2026-10-17, when the
 * flat menu had grown too long). The list shows the 8 newest maps and the
 * rest under "All maps ▸"; past 8 maps a search box on top finds any of
 * them (`domain/mapMenu.ts`).
 *
 * The examples are templates in the gallery (U12), replacing the
 * prototype's "Reset example": they always add a new map, so they can
 * never wipe one the user has worked on.
 *
 * "+ New map with tree rules" makes a decision tree (kind "tree"). The UI calls every kind a map; a tree is a
 * map with tree rules on (the owner's wording, usability pass U3).
 * A new tree opens its start box's name for typing. "+ New steps map"
 * makes a Steps map (kind "steps": an ordered process that branches and
 * joins, numbered for you), its first step's name open for typing; the
 * gallery has the Steps presets. "+ New bracket" asks for the number of
 * players (4 to 256) and makes a tournament bracket (kind "bracket"), its
 * first slot open for typing.
 *
 * "Export all maps" downloads every map as one file; on an empty Linkkit
 * (only the untouched starter example) "Restore all maps from a file"
 * reads one back. That is how maps move to a new address (each address
 * has its own localStorage).
 *
 * "Link to Boardkit…" (trees, where Boardkit's data is) and "Unlink from
 * Boardkit…" (linked trees) open their questions in `BoardLink.tsx`, as
 * does "+ Map from a Boardkit board…" (where Boardkit's data is) its list.
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
  const newTree = useMapStore((s) => s.newTree);
  const newSteps = useMapStore((s) => s.newSteps);
  const newBracket = useMapStore((s) => s.newBracket);
  const deleteMap = useMapStore((s) => s.deleteMap);
  const isTree = useMapStore((s) => s.map.kind === "tree");
  const isBracket = useMapStore((s) => s.map.kind === "bracket");
  const linked = useMapStore((s) => !!s.map.linkedBoard);
  // Asked as the menu opens: Boardkit may have been opened since.
  const [boardkitHere, setBoardkitHere] = useState(false);
  const [linking, setLinking] = useState<LinkPreview | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [boardChoicesShown, setBoardChoices] = useState<BoardChoice[] | null>(null);
  const templates = useGallery((s) => s.open);
  const setTemplates = useGallery((s) => s.setOpen);
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
  // The same for "New steps map".
  const newStepsAfterClose = useRef(false);
  // The same for "New bracket": the size picked.
  const newBracketAfterClose = useRef<BracketSize | null>(null);
  // Set by "Save this map as a template": its name field opens once the
  // menu has closed, for the same reason as "New map".
  const saveAfterClose = useRef(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  // Stored oldest-first; listed newest-first, so the latest map is always at
  // the top however many have piled up.
  const newestFirst = useMemo(() => [...maps].reverse(), [maps]);
  // Two maps never show the same name: a repeat shows as "Rent 2" (U11).
  const shown = useMemo(() => displayNames(maps), [maps]);
  const rows = useMemo(() => newestFirst.map((m) => ({ id: m.id, name: shown.get(m.id) ?? m.name })), [newestFirst, shown]);
  // Controlled, so Enter in the search box can close the menu itself.
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const list = mapMenuList(rows, query);
  const mapRow = (m: { id: MapId; name: string }) => (
    <DropdownMenuItem key={m.id} onSelect={() => switchMap(m.id)}>
      <span className={styles.check}>{m.id === mapId ? "✓" : ""}</span>
      {m.name}
    </DropdownMenuItem>
  );

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

      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          // Each opening starts with no search typed.
          if (open) {
            setBoardkitHere(hasBoardList());
            setQuery("");
          }
        }}
      >
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
            if (saveAfterClose.current) {
              saveAfterClose.current = false;
              event.preventDefault();
              setSavingTemplate(true);
              return;
            }
            const size = newBracketAfterClose.current;
            if (size) {
              newBracketAfterClose.current = null;
              event.preventDefault();
              newBracket(size);
              return;
            }
            if (newStepsAfterClose.current) {
              newStepsAfterClose.current = false;
              event.preventDefault();
              newSteps();
              return;
            }
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
          {/* Only worth a search box once some maps sit under "All maps". */}
          {rows.length > RECENT_MAPS && (
            <MapSearch
              value={query}
              onChange={setQuery}
              onEnter={() => {
                if (!list.shown[0]) return;
                switchMap(list.shown[0].id);
                setMenuOpen(false);
              }}
            />
          )}
          {list.shown.map(mapRow)}
          {query.trim() && list.shown.length === 0 && (
            <DropdownMenuLabel className="font-normal text-muted-foreground">No map called that</DropdownMenuLabel>
          )}
          {list.more.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>All maps ({rows.length})</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-96 overflow-y-auto">
                {list.more.map(mapRow)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />

          {/* Every kind of new map in one place, in the same order as the
              gallery: plain, tree rules, steps, bracket, then the ways that
              start from something already made. */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>+ New</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onSelect={() => {
                  newMap();
                  // Straight into naming it, like a new box.
                  focusNameAfterClose.current = true;
                }}
              >
                Map
                <KindHelp text={NEW_MAP_HELP.map} />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => (newTreeAfterClose.current = true)}>
                Map with tree rules
                <KindHelp text={NEW_MAP_HELP.tree} />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => (newStepsAfterClose.current = true)}>
                Process
                <KindHelp text={NEW_MAP_HELP.steps} />
              </DropdownMenuItem>
              <DropdownMenuSub>
                {/* The "?" takes the free space, so the arrow sits right after it. */}
                <DropdownMenuSubTrigger className="[&>svg:last-child]:ml-1">
                  Bracket
                  <KindHelp text={NEW_MAP_HELP.bracket} />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {BRACKET_SIZES.map((size) => (
                    <DropdownMenuItem key={size} onSelect={() => (newBracketAfterClose.current = size)}>
                      {size} players
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTemplates(true)}>
                From a template…
                <KindHelp text={NEW_MAP_HELP.template} />
              </DropdownMenuItem>
              {boardkitHere && (
                <DropdownMenuItem onSelect={() => setBoardChoices(boardChoices())}>
                  From a Boardkit board…
                  <KindHelp text={NEW_MAP_HELP.boardkit} />
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>This map</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => (focusNameAfterClose.current = true)}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={duplicateMap}>Duplicate</DropdownMenuItem>
              {/* Not a bracket: its matches are made from a size, not a template. */}
              {!isBracket && (
                <DropdownMenuItem onSelect={() => (saveAfterClose.current = true)}>Save as a template…</DropdownMenuItem>
              )}
              {isTree && !linked && boardkitHere && (
                <DropdownMenuItem onSelect={() => setLinking(linkPreview(useMapStore.getState().map))}>
                  Link to Boardkit…
                </DropdownMenuItem>
              )}
              {linked && <DropdownMenuItem onSelect={() => setUnlinking(true)}>Unlink from Boardkit…</DropdownMenuItem>}
              <DropdownMenuSeparator />
              {/* No question asked: the map goes to the trash, to restore from there. */}
              <DropdownMenuItem disabled={maps.length <= 1} onSelect={() => deleteMap(mapId)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            {/* The button's dot repeats here, so it leads the user to the
                submenu that needs them. */}
            <DropdownMenuSubTrigger className="relative">
              Backup
              {attention && <span className={styles.subDot} />}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={exportAllMaps}>Export all maps</DropdownMenuItem>
              <BackupMenuItems />
              {empty && (
                <DropdownMenuItem onSelect={() => filePicker.current?.click()}>
                  Restore all maps from a file…
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
      <BoardPickerDialog boards={boardChoicesShown} onClose={() => setBoardChoices(null)} />
      <TemplateGallery open={templates} onOpenChange={setTemplates} />
      <SaveTemplateDialog open={savingTemplate} onOpenChange={setSavingTemplate} />

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
