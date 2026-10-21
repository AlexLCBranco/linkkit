import { createContext, useContext } from "react";

import type { PageRect } from "../../domain/page";

/**
 * The map drawn as a widget on the gauntlet whiteboard (`app/whiteboard/`),
 * rather than filling Linkkit's own page. Only the part of the page the
 * boxes cover is shown, at its natural size (the whiteboard scales it); it
 * never scrolls or zooms, and there is no dotted paper behind it. Nothing
 * from the window decides where anything goes: the page is the one the map
 * was last tidied on (`LinkMap.page`), so a tree's re-tidy or a bracket's
 * layout comes out as in Linkkit, and showing a map writes nothing.
 */
export interface WhiteboardCanvas {
  /** Being edited (the open map's store, every edit as in Linkkit), or a
      read-only copy drawn by the same components. */
  readonly editing: boolean;
  /** Told the part of the page shown, whenever it changes. */
  readonly onContent?: (box: PageRect) => void;
  /** While edited: how much paper shows round the boxes, past the
      widget's box, to add boxes on (`WHITEBOARD_CONTENT.room` if not
      given). */
  readonly room?: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
}

export const WhiteboardCanvasContext = createContext<WhiteboardCanvas | null>(null);

/** `null`: Linkkit's own page. */
export const useWhiteboardCanvas = (): WhiteboardCanvas | null => useContext(WhiteboardCanvasContext);
