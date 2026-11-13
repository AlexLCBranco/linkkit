import type { BoxRoom } from "../../store/mapStore";
import { LINKED_ADD } from "./layoutConfig";
import { boxSizes, MAP_PAGE_ATTRIBUTE } from "./pageMarkers";

/**
 * What the store needs to place a new box clear of the others (`BoxRoom`):
 * every box's size as drawn on the page `from` is on (a box, or anything
 * on it), or on the map being edited when there is none to start from (a
 * menu, drawn outside the page).
 */
export function boxRoom(from: Element | null, whiteboard: boolean): BoxRoom {
  const page =
    from?.closest(`[${MAP_PAGE_ATTRIBUTE}]`) ??
    document.querySelector(`[data-linkkit-map][data-editing="true"] [${MAP_PAGE_ATTRIBUTE}]`) ??
    document.querySelector(`[${MAP_PAGE_ATTRIBUTE}]`);
  return { sizes: page ? boxSizes(page) : new Map(), ...LINKED_ADD, whiteboard };
}
