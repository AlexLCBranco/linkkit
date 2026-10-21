import { createMapId } from "../../domain/ids";
import { createMap } from "../../domain/map";
import { numberedName, UNTITLED_MAP } from "../../domain/names";
import type { MapId } from "../../domain/types";
import { setEmbedStatus } from "../../store/embed";
import { closeOpenMap, newPageSize, useMapStore } from "../../store/mapStore";
import { deleteStoredMap, mapKey, peekMap, peekMapList, saveMap } from "../../store/persistMap";
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
export function mapTakesEscape(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return true;
  const s = useMapStore.getState();
  if (s.editing || s.selected || s.group.length > 0 || s.selectedLink || s.connecting || s.dropping || s.relinking) return true;
  if (s.notesOpen || s.confirmingDelete || s.trashWarning) return true;
  return document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}
