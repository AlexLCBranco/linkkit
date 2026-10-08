import { Minus, Plus } from "lucide-react";

import { ZOOM_MAX, ZOOM_MIN, zoomedIn, zoomedOut } from "../../domain/zoom";
import { useMapStore } from "../../store/mapStore";
import { useViewStore, zoomOf } from "../../store/viewStore";
import styles from "./ZoomControls.module.css";

/**
 * Treekit's zoom pill: "−  100%  +"; clicking the percentage resets to
 * 100%. It only sets the open map's zoom in the view store; MapCanvas
 * draws the page at it, and the page grows or shrinks (scrollbars come and
 * go) to match. No keys, as in Treekit: Ctrl + wheel and Ctrl +/− stay the
 * browser's own zoom.
 */
export function ZoomControls() {
  const mapId = useMapStore((s) => s.map.id);
  const zoom = useViewStore((s) => zoomOf(s.zooms, mapId));
  const setZoom = useViewStore((s) => s.setZoom);

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.button}
        onClick={() => setZoom(mapId, zoomedOut(zoom))}
        disabled={zoom <= ZOOM_MIN}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        className={styles.value}
        onClick={() => setZoom(mapId, 1)}
        aria-label="Reset zoom to 100%"
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={() => setZoom(mapId, zoomedIn(zoom))}
        disabled={zoom >= ZOOM_MAX}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
