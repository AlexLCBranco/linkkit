import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { StoreApi } from "zustand";

import { MapCanvas } from "../../features/map/MapCanvas";
import { setMapKeysOnWhiteboard } from "../../features/map/useMapShortcuts";
import { WhiteboardCanvasContext, type WhiteboardCanvas } from "../../features/map/whiteboardCanvas";
import { useEmbedStatus } from "../../store/embed";
import type { MapId } from "../../domain/types";
import { MapStoreContext, newPageSize, useMapStore, type MapState } from "../../store/mapStore";
import { mapKey, peekMap } from "../../store/persistMap";
import { onKeyChanged } from "./bridge";
import { readDisplayMap, type DisplayMap, type DisplayStatus } from "./displayStore";
import { closeWhiteboardMap, openWhiteboardMap } from "./maps";
import styles from "./WhiteboardMap.module.css";

export interface WhiteboardMapProps {
  readonly mapId: string;
  /** Being edited: Linkkit's own store holds this map, and everything on it
      works as in Linkkit. Otherwise a picture of it, kept current. */
  readonly editing: boolean;
  /** Told the part of Linkkit's page the map shows (its natural size
      there), whenever it changes. */
  readonly onContent?: WhiteboardCanvas["onContent"];
}

/**
 * One Linkkit map on the gauntlet whiteboard: Linkkit's own boxes and
 * arrows (`MapCanvas`, `BoxView`, every menu), without the app's chrome
 * (header, map menu, zoom pill, tips, export), at natural size: just the
 * part of the page its boxes cover. The whiteboard scales it; it never
 * scrolls or zooms. No dotted paper behind it.
 *
 * Only one map is edited at a time, so the map being edited lives in
 * Linkkit's own store (`openWhiteboardMap`), with its saving, merging with
 * other tabs, undo, trash and linked board. The others are drawn by the
 * same components from read-only copies of their saved records, which
 * showing never writes.
 */
export function WhiteboardMap({ mapId, editing, onContent }: WhiteboardMapProps) {
  const box = useSteadySize();
  return (
    <div ref={box} className={styles.steady}>
      {editing ? <EditingMap mapId={mapId} onContent={onContent} /> : <ShownMap mapId={mapId} onContent={onContent} />}
    </div>
  );
}

/**
 * Starting or ending editing draws the map anew, and its boxes are measured
 * again before it shows (a frame or two): meanwhile it keeps the size it
 * had, so the widget around it never jumps.
 */
function useSteadySize(): RefObject<HTMLDivElement | null> {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let last: { w: number; h: number } | null = null;
    const check = () => {
      if (el.querySelector("[data-map-view][data-ready], [data-map-problem]")) {
        el.style.minWidth = "";
        el.style.minHeight = "";
        last = { w: el.offsetWidth, h: el.offsetHeight };
      } else if (last) {
        el.style.minWidth = `${last.w}px`;
        el.style.minHeight = `${last.h}px`;
      }
    };
    check();
    const swaps = new MutationObserver(check);
    swaps.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-ready"] });
    const sizes = new ResizeObserver(check);
    sizes.observe(el);
    return () => {
      swaps.disconnect();
      sizes.disconnect();
    };
  }, []);
  return box;
}

/** The keys a shown map follows: its own record, the trash (deleted or
    restored), and for a linked map its board and Boardkit's list (names). */
function concerns(key: string, mapId: string, store: StoreApi<MapState> | null): boolean {
  if (key === "*" || key === mapKey(mapId as never) || key === "linkkit:trash:maps" || key === "boardkit:registry") return true;
  const board = store?.getState().map.linkedBoard;
  return !!board && key === `boardkit:board:${board}`;
}

function ShownMap({ mapId, onContent }: Omit<WhiteboardMapProps, "editing">) {
  const [display, setDisplay] = useState<DisplayMap>(() => readDisplayMap(mapId));
  const store = useRef<StoreApi<MapState> | null>(display.store);

  // A picture follows every save: another tab's, Boardkit's beside it, and
  // this page's own (the map edited here, an undo from the page).
  useEffect(() => {
    const reread = () => {
      const next = readDisplayMap(mapId, store.current);
      store.current = next.store;
      setDisplay(next);
    };
    reread();
    return onKeyChanged((key) => {
      if (concerns(key, mapId, store.current)) reread();
    });
  }, [mapId]);

  const canvas = useMemo(() => ({ editing: false, onContent }), [onContent]);
  if (display.status !== "ok" || !display.store) return <Problem status={display.status} />;
  return (
    <MapStoreContext.Provider value={display.store}>
      <WhiteboardCanvasContext.Provider value={canvas}>
        <div className={styles.map} data-linkkit-map="" data-editing="false">
          <MapCanvas key={mapId} />
        </div>
      </WhiteboardCanvasContext.Provider>
    </MapStoreContext.Provider>
  );
}

function EditingMap({ mapId, onContent }: Omit<WhiteboardMapProps, "editing">) {
  // Whether there is a map to open (read, never written).
  const there = useMemo(() => peekMap(mapId as MapId, newPageSize()).status === "ok", [mapId]);
  useEffect(() => {
    openWhiteboardMap(mapId);
    setMapKeysOnWhiteboard(true);
    return () => {
      setMapKeysOnWhiteboard(false);
      closeWhiteboardMap(mapId);
    };
  }, [mapId]);
  const status = useEmbedStatus((s) => s.status);
  const shownId = useMapStore((s) => s.map.id);
  const canvas = useMemo(() => ({ editing: true, onContent }), [onContent]);
  if (!there) return <Problem status="missing" />;
  if (status === "deleted") return <Problem status="deleted" />;
  if (shownId !== mapId) return null;
  return (
    <WhiteboardCanvasContext.Provider value={canvas}>
      <div className={styles.map} data-linkkit-map="" data-editing="true">
        <MapCanvas key={mapId} />
      </div>
    </WhiteboardCanvasContext.Provider>
  );
}

function Problem({ status }: { readonly status: DisplayStatus }) {
  const text =
    status === "deleted"
      ? "This map was deleted. If it's in Linkkit's Recently deleted, restore it there."
      : status === "damaged"
        ? "This map can't be read. Open it in Linkkit to repair it."
        : "This map isn't here. It may have been deleted for good, or made in another browser.";
  return (
    <div className={styles.problem} role="status" data-map-problem={status}>
      {text}
    </div>
  );
}
