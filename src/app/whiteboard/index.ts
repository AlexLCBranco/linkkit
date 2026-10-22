// First, before anything loads the map store (see prepare.ts).
import "./prepare";

import { initAutoSave } from "../../store/autoSave";
import { initOtherTabs } from "../../store/mapStore";

/**
 * What the gauntlet whiteboard imports from Linkkit: a map as a whiteboard
 * object, drawn and edited by Linkkit's own components. See
 * `WhiteboardMap.tsx`. Its edits save as in Linkkit, and it follows other
 * tabs' saves; automatic backups stay Linkkit's own (the whiteboard has
 * its own, of everything).
 */
initAutoSave();
initOtherTabs();

export { WhiteboardMap, type WhiteboardMapProps } from "./WhiteboardMap";
export { MapParts } from "./MapParts";
export { onMapHistory, redoMap, undoMap } from "./history";
export { closeWhiteboardMap, createWhiteboardMap, doubleClickOnWhiteboardMap, deleteEmptyWhiteboardMap, linkedMapOf, linkedMaps, mapTakesEscape, openWhiteboardMap, renameWhiteboardMap, whiteboardMaps } from "./maps";
export { keyStoredElsewhere, onKeyChanged, onWroteHere } from "./bridge";
export { flushSave as flushMap } from "../../store/saveQueue";
export type { PageRect } from "../../domain/page";
