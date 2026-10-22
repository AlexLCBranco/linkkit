import { createContext, useContext } from "react";

import type { PageRect } from "../../domain/page";
import type { Point } from "../../domain/types";

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
  /** Told the part of the page shown, and the map's whiteboard shift
      (`LinkMap.shift`), whenever either changes. */
  readonly onContent?: (box: PageRect, shift: Point) => void;
}

export const WhiteboardCanvasContext = createContext<WhiteboardCanvas | null>(null);

/** `null`: Linkkit's own page. */
export const useWhiteboardCanvas = (): WhiteboardCanvas | null => useContext(WhiteboardCanvasContext);
