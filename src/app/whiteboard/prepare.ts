import { setEmbedded } from "../../store/embed";

/**
 * Imported first by `whiteboard/index.ts`, before anything loads the map
 * store: the whiteboard is embed mode with no map open yet, so loading the
 * store opens nothing and writes nothing (no example map stored, no map
 * list reconciled, not the map open last). `openWhiteboardMap` opens the
 * map being edited. The id is a placeholder no map has (Boardkit's
 * whiteboard entry does the same).
 */
setEmbedded({ id: "whiteboard:none" });
