/**
 * Marks the page and the scrolling area around it, so "Add box" (in the
 * header, outside the canvas) can find which part of the page shows. Its
 * own module: a component file that also exports constants breaks hot
 * reloading.
 */
export const MAP_PAGE_ATTRIBUTE = "data-map-page";
export const MAP_VIEW_ATTRIBUTE = "data-map-view";
