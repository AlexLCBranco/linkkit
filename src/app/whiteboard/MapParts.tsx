import { useEffect } from "react";
import { createPortal } from "react-dom";

import { DeleteBranchDialog } from "../../features/map/DeleteBranchDialog";
import { SelectionBar } from "../../features/map/SelectionBar";
import { SyncToast } from "../../features/maps/SyncToast";
import { NotesPanel } from "../../features/notes/NotesPanel";
import { TrashFullDialog } from "../../features/trash/TrashFullDialog";
import { saveOpenMapNow } from "../../store/autoSave";
import { useSaveHealth } from "../../store/saveHealth";
import styles from "./MapParts.module.css";

/**
 * What the map being edited on the whiteboard needs once per page, drawn at
 * the page's top level (fixed to the window; inside the whiteboard's
 * transforms "fixed" would mean fixed to the whiteboard): the bar for a
 * group of picked boxes, the notes panel, the "delete these too?" and
 * "trash is full" questions, Linkkit's short notices, and the banner while
 * map changes can't be saved. They all follow the open map, so they show
 * only while a map is edited (and the banner while any map write fails).
 */
export function MapParts() {
  return createPortal(
    <>
      <div className={styles.layer} data-linkkit-parts="">
        <SelectionBar />
        <NotesPanel />
      </div>
      <DeleteBranchDialog />
      <TrashFullDialog />
      <SyncToast />
      <SaveFailedBanner />
    </>,
    document.body,
  );
}

/**
 * The whiteboard's "Map changes aren't being saved": Linkkit's own banner
 * (`features/maps/SaveFailedBanner.tsx`) for the whiteboard, in the look of
 * Boardkit's there (the two stack when both fail). Shown while any map
 * write fails (the site's storage full, or blocked), with "Try again" and
 * the browser's "Leave site?" prompt; gone by itself once every failing
 * write has gone through. Its export and trash stay in Linkkit.
 */
function SaveFailedBanner() {
  const failing = useSaveHealth((s) => s.failing.length > 0);
  useEffect(() => {
    if (!failing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [failing]);
  if (!failing) return null;
  return (
    <div className={styles.banner} role="alert" data-map-save-failed="">
      <div>
        <p className={styles.title}>Map changes aren't being saved</p>
        <p className={styles.body}>
          The browser's storage for this site is full, so your latest map changes exist only in this tab. Keep it open
          until this goes away. Make room (delete maps you no longer need in Linkkit, then empty its trash), then try
          again.
        </p>
      </div>
      <button type="button" className={styles.retry} onClick={saveOpenMapNow}>
        Try again
      </button>
    </div>
  );
}
