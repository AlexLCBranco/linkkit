import type { MapId, NodeId } from "../../domain/types";
import { newPageSize, useMapStore } from "../../store/mapStore";
import { peekMap } from "../../store/persistMap";
import { flushSave } from "../../store/saveQueue";
import { closeWhiteboardMap, openWhiteboardMap } from "./maps";

/**
 * A box's link on a map shown on the gauntlet whiteboard (owner,
 * 2026-10-23), for the whiteboard's own right-click menu and Ctrl+K where
 * the map isn't being edited. Inside a map being edited, Linkkit's own menu
 * and Ctrl+K do it (features/map/BoxContextMenu.tsx).
 */

/** The link box `nodeId` on map `mapId` holds, if any. Never writes. */
export function whiteboardBoxUrl(mapId: string, nodeId: string): string | undefined {
  const open = useMapStore.getState();
  if (open.map.id === mapId) return open.map.nodes[nodeId as NodeId]?.url;
  const read = peekMap(mapId as MapId, newPageSize());
  return read.status === "ok" ? read.map.nodes[nodeId as NodeId]?.url : undefined;
}

/** Sets (`undefined`: removes) box `nodeId`'s link on map `mapId`, through
    Linkkit's store: one undo step there, which the whiteboard's page undo
    hears (history.ts), saved at once. False when the map can't be opened. */
export function setWhiteboardBoxUrl(mapId: string, nodeId: string, url: string | undefined): boolean {
  const wasOpen = useMapStore.getState().map.id === mapId;
  if (!openWhiteboardMap(mapId)) return false;
  useMapStore.getState().setBoxUrl(nodeId as NodeId, url);
  if (wasOpen) flushSave();
  else closeWhiteboardMap(mapId);
  return true;
}
