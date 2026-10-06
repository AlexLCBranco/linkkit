import { readBackup, serializeBackup, type BackupRead } from "../../domain/backup";
import { mapsForExport, newPageSize, useMapStore } from "../../store/mapStore";

/**
 * The browser side of "Export all maps" and "Restore all maps from a
 * file": turning maps into a downloaded file, and a picked file back into
 * maps. The format itself is `domain/backup.ts`.
 */

/** Downloads every map as one file, e.g. `linkkit-maps-2026-10-06.json`.
    Returns how many maps it holds. */
export function exportAllMaps(): number {
  const now = new Date();
  const maps = mapsForExport();
  const text = JSON.stringify(serializeBackup(maps, now), null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  // A link clicked from code is how a page starts a download.
  const link = document.createElement("a");
  link.href = url;
  link.download = `linkkit-maps-${now.toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked a moment later: some browsers start reading the file only
  // after the click has returned.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return maps.length;
}

/** Reads a picked file. Anything that is not JSON is "not a backup". */
export async function readBackupFile(file: File): Promise<BackupRead> {
  try {
    return readBackup(JSON.parse(await file.text()), newPageSize());
  } catch {
    return { status: "not-a-backup" };
  }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Restores from a picked file, and says what happened in words. Used by the
    map menu and by the missing-maps banner. */
export async function restoreFrom(file: File): Promise<{ title: string; text: string }> {
  const read = await readBackupFile(file);
  if (read.status === "not-a-backup") {
    return {
      title: "That isn’t a Linkkit backup",
      text: "Pick the file “Export all maps” made: its name starts with “linkkit-maps”.",
    };
  }
  const { added, alreadyHere } = useMapStore.getState().restoreMaps(read.maps);
  const notes = [
    alreadyHere > 0 && `${plural(alreadyHere, "map")} already here ${alreadyHere === 1 ? "was" : "were"} left as ${alreadyHere === 1 ? "it was" : "they were"}.`,
    read.damaged > 0 && `${plural(read.damaged, "map")} in the file couldn’t be read.`,
  ].filter(Boolean);
  return {
    title: added > 0 ? `Restored ${plural(added, "map")}` : "Nothing new to restore",
    text: notes.join(" ") || "Every map in the file is back.",
  };
}
