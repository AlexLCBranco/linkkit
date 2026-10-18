import { useState } from "react";

import type { HeldMap } from "../../domain/held";
import { createMapId } from "../../domain/ids";
import { releaseHeld, useBackupHold } from "../../store/backupHold";
import { useBackupStore } from "../../store/backupStore";
import { useMapStore } from "../../store/mapStore";
import { fileStem, downloadText } from "../export/download";
import { findLastGoodCopy } from "./autoBackup";
// The same strip as the save-failed banner: both are "stop and read this".
import styles from "./SaveFailedBanner.module.css";

/**
 * Says which maps are held back from automatic backups (`domain/held.ts`):
 * their saved text was damaged, so they opened repaired, or not at all.
 * On screen, not only in the console (owner's rule, 2026-10-18), in every
 * tab and frame, since the list is shared through storage.
 *
 * The hold ends only by the user's choice:
 * - "Keep repaired version": backups take the map as it is now.
 * - "Restore last good version": the newest backed-up copy comes back as a
 *   map of its own next to the repair (nothing is overwritten), and the
 *   hold ends since that copy is now backed up as usual.
 * - "Download original": the damaged text as it was, for repair by hand.
 */
export function BackupHoldBanner() {
  const held = useBackupHold((s) => s.held);
  const openId = useMapStore((s) => s.map.id);
  if (held.length === 0) return null;
  return (
    <>
      {held.map((entry) => (
        <HeldRow key={entry.id} entry={entry} open={entry.id === openId} />
      ))}
    </>
  );
}

function HeldRow({ entry, open }: { entry: HeldMap; open: boolean }) {
  const listed = useMapStore((s) => s.maps.some((m) => m.id === entry.id));
  const hasFolder = useBackupStore((s) => s.status === "active" || s.status === "needs-permission");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const original = (): string | null => {
    if (!entry.aside) return null;
    try {
      return localStorage.getItem(entry.aside);
    } catch {
      return null;
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const copy = await findLastGoodCopy(entry);
      if (!copy) {
        setResult("No backup in the folder has this map yet, or the browser didn't allow the folder. Nothing was changed.");
        return;
      }
      const name = entry.repaired ? `${entry.name} (last good version)` : entry.name;
      useMapStore.getState().restoreMaps([{ ...copy, id: createMapId(), name }]);
      releaseHeld(entry.id);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const text = original();
    if (text !== null) downloadText(text, `${fileStem(entry.name)}-damaged-original.json`, "application/json");
  };

  const title = entry.repaired
    ? open
      ? "This map was damaged and has been repaired"
      : `“${entry.name}” was damaged and has been repaired`
    : `“${entry.name}” was damaged and couldn't be opened`;
  const body = entry.repaired
    ? "Linkkit fixed what it could, but parts may be missing or changed. Until you choose, automatic backups keep its last good version and leave out changes made since."
    : "Nothing in it could be read. Automatic backups keep its last good version until you restore it, or dismiss this to stop keeping it.";

  return (
    <div className={styles.banner} role="alert" data-testid="backup-hold">
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        <p className={styles.body}>{result ?? body}</p>
      </div>
      <div className={styles.actions}>
        {entry.repaired && !open && listed && (
          <button type="button" className={styles.primary} onClick={() => useMapStore.getState().switchMap(entry.id)}>
            Open it
          </button>
        )}
        {hasFolder && (
          <button type="button" className={open ? styles.secondary : styles.primary} disabled={busy} onClick={() => void restore()}>
            Restore last good version
          </button>
        )}
        {original() !== null && (
          <button type="button" className={styles.secondary} onClick={download}>
            Download original
          </button>
        )}
        <button type="button" className={open ? styles.primary : styles.secondary} onClick={() => releaseHeld(entry.id)}>
          {entry.repaired ? "Keep repaired version" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}
