import type { NodeId, Size } from "../../domain/types";

/**
 * Marks the page and the scrolling area around it, so code outside the
 * canvas ("Add box" in the header) or outside rendering (a drag) can find
 * which part of the page shows and how big things are. Its own module: a
 * component file that also exports constants breaks hot reloading.
 */
export const MAP_PAGE_ATTRIBUTE = "data-map-page";
export const MAP_VIEW_ATTRIBUTE = "data-map-view";

/** The attribute every box carries, so a point on screen can be traced back
    to the box under it. */
export const BOX_ID_ATTRIBUTE = "data-box-id";

/** The screen's size: the scrolling area, without its scrollbars. */
export function screenSize(view: Element): Size {
  return { width: view.clientWidth, height: view.clientHeight };
}

/** Every box's size as drawn on the page. */
export function boxSizes(page: Element): Map<NodeId, Size> {
  const sizes = new Map<NodeId, Size>();
  for (const el of page.querySelectorAll<HTMLElement>(`[${BOX_ID_ATTRIBUTE}]`)) {
    sizes.set(el.getAttribute(BOX_ID_ATTRIBUTE) as NodeId, { width: el.offsetWidth, height: el.offsetHeight });
  }
  return sizes;
}
