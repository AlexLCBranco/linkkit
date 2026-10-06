import { BACKUP_QUIET_MS, backupFileName, backupsToDelete } from "../../domain/autoBackup";
import { serializeBackup } from "../../domain/backup";
import { useBackupStore } from "../../store/backupStore";
import { idbDelete, idbGet, idbSet } from "../../store/idb";
import { mapsForExport, useMapStore } from "../../store/mapStore";

/**
 * Automatic backup to a folder the user picks (File System Access API, so
 * Chrome and Edge only), copied from Boardkit's `autoBackup.ts`. A few
 * seconds after changes stop, every map is written to a new file in that
 * folder -- the same format as "Export all maps", so "Restore all maps from
 * a file" reads it -- and the oldest beyond the last 20 are deleted.
 *
 * The folder handle is kept in IndexedDB. After a browser restart Chrome
 * wants one click before it allows writing again, so startup can land in
 * "needs-permission" and the menu offers "Resume backups". Backups never
 * stop silently: every stop is a status the menu shows, with a dot on the
 * menu's button.
 *
 * Simpler than Boardkit's: Linkkit has no pictures to carry, and a damaged
 * map is repaired (or set aside) when the list loads, so there is no
 * unreadable map to hold back.
 */

/** The parts of the File System Access API used here; `lib.dom` does not
    declare the permission methods or the async iteration. */
export type Folder = FileSystemDirectoryHandle & {
  queryPermission(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
  values(): AsyncIterable<FileSystemHandle>;
};

type PickerWindow = Window & {
  showDirectoryPicker?: (options: { id: string; mode: "readwrite" }) => Promise<Folder>;
};

const FOLDER_KEY = "backupFolder";

let folder: Folder | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let rerun = false;
/** The maps as last written, so a change that changes nothing (a switch
    and back) doesn't spend one of the 20 slots on an identical file. */
let lastWritten: string | null = null;

const backup = () => useBackupStore.getState();

export function isAutoBackupSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";
}

/** Called once from `main.tsx`: restores the saved folder and starts
    watching for changes. */
export function initAutoBackup(): void {
  if (!isAutoBackupSupported()) {
    backup().setAuto("unsupported", null);
    return;
  }
  void restoreFolder();
  useMapStore.subscribe((state, previous) => {
    // An edit to the open map, or the list changing (new, delete, rename,
    // restore). Switching maps changes `map` too; the signature check below
    // keeps that from writing an identical file.
    if (state.map !== previous.map || state.maps !== previous.maps) scheduleBackup();
  });
}

async function restoreFolder(): Promise<void> {
  try {
    const saved = await idbGet<Folder>(FOLDER_KEY);
    if (!saved) {
      backup().setAuto("off", null);
      return;
    }
    folder = saved;
    const permission = await saved.queryPermission({ mode: "readwrite" });
    backup().setAuto(permission === "granted" ? "active" : "needs-permission", saved.name);
  } catch {
    backup().setAuto("off", null);
  }
}

/** Waits for a quiet moment. Deliberately no write on page close: the API
    is asynchronous and can't be relied on to finish there. */
function scheduleBackup(): void {
  if (backup().status !== "active") return;
  clearTimeout(timer);
  timer = setTimeout(() => void runBackup(), BACKUP_QUIET_MS);
}

/** Only ever one write in flight; a change during a write earns one more. */
async function runBackup(): Promise<void> {
  if (!folder || backup().status !== "active") return;
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    await writeBackupFile(folder);
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      scheduleBackup();
    }
  }
}

async function writeBackupFile(target: Folder): Promise<void> {
  // The open map as it is on screen, saved or not; the others as last
  // saved (or still waiting for a failed save, see `persistMap.ts`).
  const maps = mapsForExport();
  // Nothing to keep yet (the first visit's example before its first tidy):
  // an empty file would only push a good backup out of the last 20.
  if (maps.length === 0) return;
  const signature = JSON.stringify(maps);
  if (signature === lastWritten) return;
  const now = new Date();
  const name = backupFileName(now);
  const text = JSON.stringify(serializeBackup(maps, now), null, 2);
  try {
    // `createWritable` writes to a temporary file and replaces the real one
    // only on `close()`, so a crash mid-write can't leave half a backup.
    const file = await target.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(text);
    await writable.close();
  } catch (error) {
    // The folder was deleted or moved, or the permission was withdrawn.
    const denied = error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name);
    backup().setAuto(denied ? "needs-permission" : "folder-error", target.name);
    return;
  }
  lastWritten = signature;
  backup().markBackedUp(now.getTime());
  await rotate(target, name);
}

/** Deletes automatic backups beyond the newest 20 -- only ever after a new
    one was written, so repeated failures can't eat the good copies. A
    failure here is ignored: the backup itself worked, and the next round
    tries again. */
async function rotate(target: Folder, justWritten: string): Promise<void> {
  try {
    const names: string[] = [];
    for await (const entry of target.values()) {
      if (entry.kind === "file") names.push(entry.name);
    }
    for (const old of backupsToDelete(names, justWritten)) {
      await target.removeEntry(old);
    }
  } catch {
    // See above.
  }
}

/** "Automatic backup…" / "Choose folder…". Must run from a click: the
    folder picker requires one. */
export async function chooseBackupFolder(): Promise<void> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return;
  let chosen: Folder;
  try {
    chosen = await picker.call(window, { id: "linkkit-backup", mode: "readwrite" });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      backup().setNote("Couldn't open that folder. Try another one.");
    }
    return;
  }
  folder = chosen;
  lastWritten = null;
  backup().setNote(null);
  try {
    await idbSet(FOLDER_KEY, chosen);
  } catch {
    backup().setNote("This browser won't remember the folder, so it will need choosing again after a restart.");
  }
  backup().setAuto("active", chosen.name);
  await runBackup();
}

/** "Resume backups": asks the browser to allow the saved folder again.
    Must run from a click. */
export async function resumeBackups(): Promise<void> {
  if (!folder) return;
  try {
    if ((await folder.requestPermission({ mode: "readwrite" })) !== "granted") return;
  } catch {
    backup().setAuto("folder-error", folder.name);
    return;
  }
  backup().setAuto("active", folder.name);
  // Anything changed while backups were paused was never written.
  lastWritten = null;
  await runBackup();
}

export async function turnOffAutoBackup(): Promise<void> {
  clearTimeout(timer);
  folder = undefined;
  lastWritten = null;
  backup().setAuto("off", null);
  backup().setNote(null);
  try {
    await idbDelete(FOLDER_KEY);
  } catch {
    // Already off in memory; a stale handle is harmless, and the next
    // "Automatic backup…" replaces it.
  }
}
