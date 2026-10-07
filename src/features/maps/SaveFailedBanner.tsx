import { useEffect } from "react";

import { saveOpenMapNow } from "../../store/autoSave";
import { useSaveHealth } from "../../store/saveHealth";
import { exportAllMaps } from "./backupFile";
import styles from "./SaveFailedBanner.module.css";

/**
 * While saves fail, closing or reloading the tab asks first (the browser's
 * own "Leave site?" prompt): the banner only helps while someone is looking
 * at the tab, and closing it is the moment unsaved work is lost. Removed as
 * soon as saves succeed. Browsers show it only after the page has been
 * clicked or typed in, and mobile Safari never shows it.
 */
function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need a returnValue set to show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}

/**
 * Shown while saving fails (browser storage full or blocked). Not a toast:
 * it stays until every failing write has gone through again, since until
 * then the latest changes live only in this tab.
 *
 * The ways out are exporting (the file
 * holds the open map as it is on screen, saved or not), making room
 * (emptying the trash: a deleted map keeps its storage until then), and
 * trying again.
 */
export function SaveFailedBanner() {
  const failing = useSaveHealth((s) => s.failing.length > 0);
  useLeaveWarning(failing);
  if (!failing) return null;

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.text}>
        <p className={styles.title}>Changes aren't being saved</p>
        <p className={styles.body}>
          The browser's storage for this site is full, so your latest changes exist only in this
          tab. Keep it open until this goes away (switching maps is fine). Export your maps now,
          then make room (delete maps you no longer need, then empty the trash) and try again.
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => exportAllMaps()}>
          Export all maps
        </button>
        <button type="button" className={styles.secondary} onClick={saveOpenMapNow}>
          Try again
        </button>
      </div>
    </div>
  );
}
