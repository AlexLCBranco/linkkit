import { Plus } from "lucide-react";

import { clampToPage, freeSpot, visibleCenter } from "../../domain/page";
import type { NodeId, Size } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import styles from "./HeaderButton.module.css";
import { ADD_SPOT, MAP_LAYOUT, PAGE_INSETS } from "./layoutConfig";
import { MAP_PAGE_ATTRIBUTE, MAP_VIEW_ATTRIBUTE } from "./pageMarkers";
import { BOX_ID_ATTRIBUTE } from "./useBoxGestures";

/**
 * "Add box": puts a new box in the middle of the part of the page that is
 * on screen (the prototype used the page's top, which may be scrolled out
 * of sight), ready for its name. The mouse-only way to add a box, beside
 * double-clicking the paper.
 *
 * If that spot is taken, the box steps aside until it overlaps nothing.
 *
 * It sits in the header, outside the canvas, so it finds the page, the
 * scrolling area around it and the boxes' sizes through their marker
 * attributes in the page.
 */
export function AddBoxButton() {
  const addBox = useMapStore((s) => s.addBox);

  const onClick = () => {
    const page = document.querySelector(`[${MAP_PAGE_ATTRIBUTE}]`);
    const view = document.querySelector(`[${MAP_VIEW_ATTRIBUTE}]`);
    if (!page || !view) return;
    const { map } = useMapStore.getState();
    const sizes = new Map<NodeId, Size>();
    for (const el of page.querySelectorAll<HTMLElement>(`[${BOX_ID_ATTRIBUTE}]`)) {
      sizes.set(el.getAttribute(BOX_ID_ATTRIBUTE) as NodeId, { width: el.offsetWidth, height: el.offsetHeight });
    }
    // The new box is not measured yet: a typical box's size stands in.
    const size = MAP_LAYOUT.fallbackSize;
    const middle = visibleCenter(page.getBoundingClientRect(), view.getBoundingClientRect());
    const spot = freeSpot(map, sizes, middle, size, { ...ADD_SPOT, fallbackSize: size });
    addBox(clampToPage(spot, size, map.page, PAGE_INSETS));
  };

  return (
    <button type="button" className={styles.button} onClick={onClick} title="Add a box (or double-click the paper)">
      <Plus size={16} />
      Add box
    </button>
  );
}
