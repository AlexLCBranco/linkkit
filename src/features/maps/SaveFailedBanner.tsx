import { saveOpenMapNow } from "../../store/autoSave";
import { useSaveHealth } from "../../store/saveHealth";
import { exportAllMaps } from "./backupFile";
import styles from "./SaveFailedBanner.module.css";

/**
 * Shown while saving fails (browser storage full or blocked). Not a toast:
 * it stays until every failing write has gone through again, since until
 * then the latest changes live only in this tab.
 *
 * Linkkit has no trash to empty, so the ways out are exporting (the file
 * holds the open map as it is on screen, saved or not), making room
 * elsewhere, and trying again.
 */
export function SaveFailedBanner() {
  const failing = useSaveHealth((s) => s.failing.length > 0);
  if (!failing) return null;

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.text}>
        <p className={styles.title}>Changes aren't being saved</p>
        <p className={styles.body}>
          The browser's storage for this site is full, so your latest changes exist only in this
          tab. Keep it open until this goes away (switching maps is fine). Export your maps now,
          then make room (delete maps you no longer need) and try again.
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
