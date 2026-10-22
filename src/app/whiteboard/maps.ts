import { createMapId } from "../../domain/ids";
import { createMap } from "../../domain/map";
import { numberedName, UNTITLED_MAP } from "../../domain/names";
import { hasTreeShape, type MapId } from "../../domain/types";
import { setEmbedStatus } from "../../store/embed";
import { mapFromBoard } from "../../domain/bridge";
import { createTree } from "../../domain/tree";
import { boardChoices, closeOpenMap, newPageSize, takeStoredElsewhere, useMapStore } from "../../store/mapStore";
import { loadBoard } from "../../store/persistBoard";
import { deleteStoredMap, mapKey, peekMap, peekMapList, saveMap } from "../../store/persistMap";
import { wroteHere } from "../../store/storedHere";
import { useSaveHealth } from "../../store/saveHealth";
import { cancelSave } from "../../store/saveQueue";

/**
 * The gauntlet whiteboard's ways in to Linkkit's maps: the list (its Map
 * picker), a new map, and opening and closing the one map being edited.
 * Reading never writes (`peekMapList`, `peekMap`).
 */

/** Linkkit's maps, in its order, as its map menu lists them. */
export const whiteboardMaps = (): { readonly id: string; readonly name: string }[] => peekMapList().map((m) => ({ id: m.id, name: m.name }));

/**
 * A new, empty map, as Linkkit's own "New map" makes one ("Untitled map",
 * or "Untitled map 2", ... when that is taken), stored at once so Linkkit
 * lists it. Nothing is opened, and which map Linkkit itself opens next is
 * left as it is. `null` when it could not be stored (storage full).
 * `again`: the same map once more, after `deleteEmptyWhiteboardMap` (its
 * widget came back: a redo, an undo of its delete).
 */
export function createWhiteboardMap(again?: { readonly id: string; readonly name: string }): { readonly id: string; readonly name: string } | null {
  const name = again?.name ?? numberedName(UNTITLED_MAP, peekMapList().map((m) => m.name));
  const map = createMap((again?.id as MapId | undefined) ?? createMapId(), name, newPageSize());
  saveMap(map);
  if (useSaveHealth.getState().failing.includes(mapKey(map.id))) {
    // Not kept: nothing on the whiteboard shows it.
    deleteStoredMap(map.id);
    return null;
  }
  return { id: map.id, name };
}

/**
 * Deletes a map made with `createWhiteboardMap` again, if it is still
 * exactly as made: no boxes, nothing in its trash, still under `name`.
 * Never the last map (Linkkit always keeps one). True when it was deleted.
 */
export function deleteEmptyWhiteboardMap(id: string, name: string): boolean {
  const read = peekMap(id as MapId, newPageSize());
  if (read.status !== "ok") return false;
  const { map } = read;
  if (Object.keys(map.nodes).length > 0 || map.trash.length > 0 || map.name !== name || map.linkedBoard) return false;
  if (peekMapList().length <= 1) return false;
  if (useMapStore.getState().map.id === id) {
    closeOpenMap();
    cancelSave();
  }
  deleteStoredMap(id as MapId);
  return true;
}

/**
 * "Add map view" on a board widget: a new map linked to Boardkit board
 * `boardId`, as Linkkit's "Map from a Boardkit board…" makes one (named
 * after the board, its lists and cards as boxes), stored at once. Nothing
 * is opened, and nothing is written in Boardkit. Why not, as text, when
 * the board can't have one (it has one already, say) or storage is full.
 */
export function createLinkedWhiteboardMap(boardId: string): { readonly id: string } | { readonly refused: string } {
  const choice = boardChoices().find((c) => c.id === boardId);
  const read = loadBoard(boardId);
  if (!choice || choice.reason || read.status !== "ok") return { refused: choice?.reason ?? "That board is no longer in Boardkit." };
  const { map: blank } = createTree(createMapId(), choice.name, newPageSize());
  const { map } = mapFromBoard(blank, boardId, choice.name, read.record.board);
  saveMap(map);
  if (useSaveHealth.getState().failing.includes(mapKey(map.id))) {
    deleteStoredMap(map.id);
    return { refused: "The map could not be saved: this browser's storage is full." };
  }
  return { id: map.id };
}

/**
 * "Unlink map" on a board widget: the linked map becomes an ordinary map
 * with its own copy (Linkkit's "Unlink from Boardkit"); the board stays in
 * Boardkit as it is. Returns the map's stored record from before, to put
 * back for an undo (`restoreWhiteboardMapRecord`), or `null` when there
 * was nothing to unlink.
 */
export function unlinkWhiteboardMap(id: string): string | null {
  const before = localStorage.getItem(mapKey(id as MapId));
  if (before === null) return null;
  const wasOpen = useMapStore.getState().map.id === id;
  if (!openWhiteboardMap(id) || !useMapStore.getState().map.linkedBoard) {
    if (!wasOpen && useMapStore.getState().map.id === id) closeOpenMap();
    return null;
  }
  useMapStore.getState().unlinkFromBoard();
  if (!wasOpen) closeOpenMap();
  return before;
}

/** Puts a map's stored record back as it was (`unlinkWhiteboardMap`'s
    undo), as another tab's write would. */
export function restoreWhiteboardMapRecord(id: string, record: string): void {
  if (useMapStore.getState().map.id === id) closeOpenMap();
  const key = mapKey(id as MapId);
  localStorage.setItem(key, record);
  takeStoredElsewhere(key, false);
  wroteHere(key);
}

/** Renames a map, as its name field in Linkkit's header does. */
export function renameWhiteboardMap(id: string, name: string): void {
  const open = useMapStore.getState();
  if (open.map.id === id) {
    open.renameMap(name);
    return;
  }
  openWhiteboardMap(id);
  useMapStore.getState().renameMap(name);
  closeOpenMap();
}

/**
 * Opens map `id` in Linkkit's store for editing (as Linkkit's map menu
 * does, which writes nothing), keeping the history of the map open before
 * it. False when the map isn't there (nothing is changed then).
 */
export function openWhiteboardMap(id: string): boolean {
  const s = useMapStore.getState();
  if (s.map.id === id && !s.needsTidy) return true;
  if (peekMap(id as MapId, newPageSize()).status !== "ok") return false;
  s.switchMap(id as MapId);
  const opened = useMapStore.getState().map.id === id;
  if (opened) setEmbedStatus("ok");
  return opened;
}

/** The map being edited is done with (`closeOpenMap`). */
export function closeWhiteboardMap(id: string): void {
  if (useMapStore.getState().map.id === id) closeOpenMap();
}

/**
 * The map linked to Boardkit board `boardId` (shown with it as one widget
 * on the whiteboard), or `null`. Not one in Linkkit's trash. Read from
 * Linkkit's own records only, never written.
 */
export function linkedMapOf(boardId: string): string | null {
  return linkedMaps()[boardId] ?? null;
}

/** Every board that has a linked map (not one in Linkkit's trash): board
    id -> map id. Read from Linkkit's own records only, never written. */
export function linkedMaps(): Record<string, string> {
  const links: Record<string, string> = Object.create(null);
  for (const { id } of peekMapList()) {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(mapKey(id as MapId)) ?? "null");
      const linked = typeof data === "object" && data !== null ? (data as { map?: { linkedBoard?: unknown } }).map?.linkedBoard : undefined;
      if (typeof linked === "string" && !(linked in links)) links[linked] = id;
    } catch {
      // Unreadable: not linked as far as can be told.
    }
  }
  return links;
}

/** Whether an Escape pressed while the map is edited is Linkkit's (typing
    ends, a selection or a drag is let go, a menu, panel or question
    closes), rather than the whiteboard's (editing ends). */
/**
 * A double-click at this point on the screen, anywhere on the whiteboard's
 * page, made on the map being edited (`mapId`): what a double-click on its
 * paper does there (a new box at that spot, or the nearest free one; a
 * tree says why not), even outside the map's own area. False when that map
 * isn't the one being edited, or isn't drawn yet.
 */
export function doubleClickOnWhiteboardMap(mapId: string, x: number, y: number): boolean {
  if (useMapStore.getState().map.id !== mapId) return false;
  const pane = document.querySelector('[data-linkkit-map][data-editing="true"] .react-flow__pane');
  if (!pane) return false;
  pane.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  return true;
}

/**
 * How boxes are added to map `mapId` while it is edited, for the
 * whiteboard to say so: "anywhere" (a double-click anywhere on the page),
 * "from-a-box" (tree rules: a box's + or its dot dragged out; a
 * double-click on the paper says why not), "fixed" (a bracket), or `null`
 * while that map isn't the one open. Follows the map as it changes.
 */
export function useWhiteboardMapAdding(mapId: string): "anywhere" | "from-a-box" | "fixed" | null {
  return useMapStore((s) => (s.map.id !== mapId ? null : s.map.kind === "bracket" ? "fixed" : hasTreeShape(s.map.kind) ? "from-a-box" : "anywhere"));
}

export function mapTakesEscape(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return true;
  const s = useMapStore.getState();
  if (s.editing || s.selected || s.group.length > 0 || s.selectedLink || s.connecting || s.dropping || s.relinking) return true;
  if (s.notesOpen || s.confirmingDelete || s.trashWarning) return true;
  return document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}
