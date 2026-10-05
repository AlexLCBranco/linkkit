import { ChevronsUpDown } from "lucide-react";
import { useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { pageRightEdge, pageWidthForRightEdge } from "../../domain/page";
import type { Size } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { DRAG_THRESHOLD, MORE_ROOM_STEP } from "./layoutConfig";
import styles from "./PageHandles.module.css";
import { MAP_PAGE_ATTRIBUTE, MAP_VIEW_ATTRIBUTE } from "./pageMarkers";

interface PageHandlesProps {
  /** The smallest the page may get (it never cuts a box off). */
  minSize: () => Size;
  /** The size being dragged to, drawn but not yet saved; `null` when done. */
  onDraft: (size: Size | null) => void;
}

/**
 * The two ways to resize the page, as in the prototype:
 *
 * - The "More room" tab on the bottom edge drags the page taller (or
 *   shorter). A plain click adds a fixed amount of room -- an addition to
 *   the prototype, so the tab also does something for whoever just clicks
 *   it (and works from the keyboard).
 * - The grip in the bottom-right corner drags both width and height.
 *
 * While dragging, the new size is only drawn (`onDraft`) and shown as
 * "width × height"; letting go saves it once. The page is centred on the
 * screen, so it grows on both sides: the width maths (domain/page.ts)
 * keeps the grip under the pointer anyway. Scrolling mid-drag (the mouse
 * wheel) carries the drag on from the new scroll position.
 */
export function PageHandles({ minSize, onDraft }: PageHandlesProps) {
  const [tip, setTip] = useState<Size | null>(null);
  // A drag of the tab ends in a click; this keeps that click from also
  // adding room.
  const tabDragged = useRef(false);

  const startDrag = (e: ReactPointerEvent<HTMLElement>, horizontal: boolean) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const sheet = el.closest(`[${MAP_PAGE_ATTRIBUTE}]`)?.parentElement;
    const view = el.closest<HTMLElement>(`[${MAP_VIEW_ATTRIBUTE}]`);
    if (!sheet || !view) return;
    // No text selection while dragging. That also stops the press from
    // taking focus, so a name being typed is finished by hand.
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    el.setPointerCapture(e.pointerId);
    tabDragged.current = false;
    let dragged = false;

    // Pointer positions become page coordinates: from the left and top of
    // the area the page is centred in, scrolling included.
    const pad = parseFloat(getComputedStyle(sheet).paddingLeft);
    const frame = () => {
      const r = view.getBoundingClientRect();
      return {
        left: r.left - view.scrollLeft + pad,
        top: r.top - view.scrollTop + pad,
        available: view.clientWidth - 2 * pad,
      };
    };
    const start = useMapStore.getState().map.page;
    const min = minSize();
    const f0 = frame();
    // Where on the grip or tab it was grabbed, so the page does not jump.
    const grab = {
      x: e.clientX - f0.left - pageRightEdge(start.width, f0.available),
      y: e.clientY - f0.top - start.height,
    };
    const startClient = { x: e.clientX, y: e.clientY };
    let pointer = startClient;
    let size = start;

    const update = () => {
      const f = frame();
      const width = horizontal
        ? Math.max(min.width, Math.round(pageWidthForRightEdge(pointer.x - f.left - grab.x, f.available)))
        : start.width;
      const height = Math.max(min.height, Math.round(pointer.y - f.top - grab.y));
      size = { width, height };
      onDraft(size);
      setTip(size);
    };
    const move = (ev: PointerEvent) => {
      pointer = { x: ev.clientX, y: ev.clientY };
      if (!dragged && Math.hypot(pointer.x - startClient.x, pointer.y - startClient.y) < DRAG_THRESHOLD) {
        return;
      }
      dragged = true;
      update();
    };
    const onScroll = () => {
      if (dragged) update();
    };
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      view.removeEventListener("scroll", onScroll);
      if (dragged) useMapStore.getState().resizePage(size);
      tabDragged.current = dragged && !horizontal;
      onDraft(null);
      setTip(null);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    view.addEventListener("scroll", onScroll);
  };

  const onTabClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (tabDragged.current) {
      tabDragged.current = false;
      return;
    }
    const { map, resizePage } = useMapStore.getState();
    resizePage({ width: map.page.width, height: map.page.height + MORE_ROOM_STEP });
    // Once the taller page is drawn, scrolls the tab (now lower down) back
    // into view -- at once, not smoothly, so it lands under the pointer
    // again and a few clicks in a row keep adding room.
    const tab = e.currentTarget;
    setTimeout(() => tab.scrollIntoView({ block: "nearest" }));
  };

  return (
    <>
      <button
        type="button"
        className={styles.tab}
        data-active={tip ? true : undefined}
        title="Drag to make the page taller, or click for more room"
        onPointerDown={(e) => startDrag(e, false)}
        onClick={onTabClick}
      >
        <ChevronsUpDown size={12} aria-hidden />
        More room
      </button>
      <div
        className={styles.grip}
        data-active={tip ? true : undefined}
        title="Drag to resize the page"
        aria-hidden
        onPointerDown={(e) => startDrag(e, true)}
      >
        <svg viewBox="0 0 12 12" width="12" height="12">
          <path d="M11 3L3 11M11 7L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      {tip && (
        <div className={styles.tip}>
          {tip.width} × {tip.height}
        </div>
      )}
    </>
  );
}
