import { Plus } from "lucide-react";

import { clampToPage, freeSpot, pageSize, visibleCenter } from "../../domain/page";
import { canAddNextStep, nextStepRefusal } from "../../domain/rules";
import { useMapStore } from "../../store/mapStore";
import styles from "./HeaderButton.module.css";
import { ADD_SPOT, MAP_LAYOUT, PAGE_INSETS } from "./layoutConfig";
import { boxSizes, drawnZoom, MAP_PAGE_ATTRIBUTE, MAP_SHEET_ATTRIBUTE, MAP_VIEW_ATTRIBUTE, screenSize } from "./pageMarkers";

/**
 * "Add box": puts a new box in the middle of the part of the page that is
 * on screen (the prototype used the page's top, which may be scrolled out
 * of sight), ready for its name. The mouse-only way to add a box, beside
 * double-clicking the paper.
 *
 * If that spot is taken, the box steps aside until it overlaps nothing.
 *
 * In a tree a box can't stand on its own, so the button adds a next step
 * to the selected box instead (and the tree makes room for it). With
 * nothing selected, or a card selected in a tree linked to Boardkit (cards
 * take no next steps there), it is greyed out, and its tooltip says why.
 *
 * It sits in the header, outside the canvas, so it finds the page, the
 * scrolling area around it and the boxes' sizes through their marker
 * attributes in the page.
 */
export function AddBoxButton() {
  const addBox = useMapStore((s) => s.addBox);
  const addNextStep = useMapStore((s) => s.addNextStep);
  const isTree = useMapStore((s) => s.map.kind === "tree");
  const selected = useMapStore((s) => s.selected);
  // A card in a tree linked to Boardkit takes no next steps: why, in words.
  const refusal = useMapStore((s) => (s.selected && isTree ? nextStepRefusal(s.map, s.selected) : null));
  const addable = useMapStore((s) => !!s.selected && canAddNextStep(s.map, s.selected));

  const onClick = () => {
    if (isTree) {
      if (selected && addable) addNextStep(selected);
      return;
    }
    const page = document.querySelector(`[${MAP_PAGE_ATTRIBUTE}]`);
    const view = document.querySelector(`[${MAP_VIEW_ATTRIBUTE}]`);
    const sheet = document.querySelector<HTMLElement>(`[${MAP_SHEET_ATTRIBUTE}]`);
    if (!page || !view || !sheet) return;
    const { map } = useMapStore.getState();
    const sizes = boxSizes(page);
    // The new box is not measured yet: a typical box's size stands in.
    const size = MAP_LAYOUT.fallbackSize;
    const middle = visibleCenter(sheet.getBoundingClientRect(), view.getBoundingClientRect(), drawnZoom(sheet));
    const spot = freeSpot(map, sizes, middle, size, { ...ADD_SPOT, fallbackSize: size });
    const room = pageSize(map, sizes, MAP_LAYOUT.fallbackSize, PAGE_INSETS, screenSize(view));
    addBox(clampToPage(spot, size, room, PAGE_INSETS));
  };

  const title = !isTree
    ? "Add a box (or double-click the paper)"
    : !selected
      ? "Select a box first: the new box becomes its child"
      : (refusal ?? "Add a child to the selected box");

  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      // Not `disabled`: a disabled button shows no tooltip, and this one
      // must say why it is greyed out.
      aria-disabled={isTree && !addable}
      title={title}
    >
      <Plus size={16} />
      <span className={styles.word}>Add box</span>
    </button>
  );
}
