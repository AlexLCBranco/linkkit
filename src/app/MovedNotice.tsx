import { useState } from "react";

import { exportAllMaps } from "../features/maps/backupFile";
import styles from "./MovedNotice.module.css";

/**
 * Shown instead of the whole app on an old address (see `domain/address.ts`).
 * The big button goes to the new home; the small one downloads whatever this
 * address still holds, in the same file "Restore all maps from a file"
 * reads, so it can be brought over. Nothing here clears storage.
 */
export function MovedNotice({ to }: { to: string }) {
  const [exported, setExported] = useState<number | null>(null);
  const display = to.replace(/^https:\/\//, "").replace(/\/$/, "");
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Linkkit moved</h1>
        <p className={styles.body}>
          This app moved to <strong>{display}</strong>. Changes made here don't sync and aren't backed
          up.
        </p>
        <a className={styles.primary} href={to}>
          Go to {display}
        </a>
        <button type="button" className={styles.secondary} onClick={() => setExported(exportAllMaps())}>
          Export everything saved here
        </button>
        {exported !== null && (
          <p className={styles.note} role="status">
            Downloaded {exported} {exported === 1 ? "map" : "maps"}. At the new address, open the map
            menu and pick “Restore all maps from a file”.
          </p>
        )}
      </div>
    </main>
  );
}
