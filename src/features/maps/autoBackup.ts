import { BACKUP_QUIET_MS, backupFileName, backupsNewestFirst, backupsToDelete } from "../../domain/autoBackup";
import { serializeBackup } from "../../domain/backup";
import { heldBackWarning, takeCopies, withHeldBack, type HeldMap } from "../../domain/held";
import type { LinkMap, MapId } from "../../domain/types";
import { useBackupHold } from "../../store/backupHold";
import { useBackupStore } from "../../store/backupStore";
import { idbDelete, idbGet, idbSet } from "../../store/idb";
import { mapsForExport, newPageSize, useMapStore } from "../../store/mapStore";
import { loadTemplates, useTemplates } from "../../store/templates";

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
 * A map found damaged is held back, as in Boardkit (`domain/held.ts`):
 * each new file carries its last backed-up version forward, so its last
 * good copy never rotates out, and every other map is backed up as usual.
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
/** Whether this copy of Linkkit writes the backups. With Linkkit open in
    several tabs and canvas frames at once, only one does (a Web Lock), or
    each would write its own file of the same maps and the 20 kept files
    would cover minutes instead of days. The others still show the status,
    and take over when the writer closes. */
let writer = false;
const WRITER_LOCK = "linkkit-auto-backup";
/** Tells the other copies that the folder changed (chosen, resumed, off). */
let channel: BroadcastChannel | null = null;

/** Storage keys whose change is a change to what a backup holds: maps, the
    list, the trash, templates, the held list, and a linked map's board. */
const BACKED_UP_KEYS = ["linkkit:map:", "linkkit:registry", "linkkit:trash:", "linkkit:templates", "linkkit:held", "boardkit:board:"];

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
  claimWriter();
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(WRITER_LOCK);
    // Another copy chose a folder, resumed, or turned backups off.
    channel.onmessage = () => {
      lastWritten = null;
      void restoreFolder().then(scheduleBackup);
    };
  }
  // A change made in another tab or frame: the writer may not have that map
  // open, so its own store wouldn't notice.
  window.addEventListener("storage", (event) => {
    if (event.key && BACKED_UP_KEYS.some((prefix) => event.key!.startsWith(prefix))) scheduleBackup();
  });
  useMapStore.subscribe((state, previous) => {
    // An edit to the open map, or the list changing (new, delete, rename,
    // restore). Switching maps changes `map` too; the signature check below
    // keeps that from writing an identical file.
    if (state.map !== previous.map || state.maps !== previous.maps) scheduleBackup();
  });
  // A template saved, removed or restored is in the backup too.
  useTemplates.subscribe((state, previous) => {
    if (state.saved !== previous.saved) scheduleBackup();
  });
  // A map held back, or released (here or in another tab).
  useBackupHold.subscribe((state, previous) => {
    if (state.held !== previous.held) scheduleBackup();
  });
}

/** Waits for the writer's lock; holds it until this page closes. Without
    Web Locks (older browsers) every copy writes, as before. */
function claimWriter(): void {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) {
    writer = true;
    return;
  }
  void locks.request(WRITER_LOCK, () => {
    writer = true;
    // Taking over from a copy that closed: anything since its last file.
    scheduleBackup();
    return new Promise<never>(() => {});
  });
}

const tellOthers = () => channel?.postMessage("folder");

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
  if (!writer || backup().status !== "active") return;
  clearTimeout(timer);
  timer = setTimeout(() => void runBackup(), BACKUP_QUIET_MS);
}

/** Only ever one write in flight; a change during a write earns one more. */
async function runBackup(): Promise<void> {
  if (!writer || !folder || backup().status !== "active") return;
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
  const held = useBackupHold.getState().held;
  const copies = held.length > 0 ? await lastBackedUpCopies(target, held) : new Map<MapId, LinkMap>();
  backup().setWarning(heldBackWarning(held, new Set(copies.keys())));
  const maps = withHeldBack(mapsForExport(), held, copies);
  // Nothing to keep yet (the first visit's example before its first tidy):
  // an empty file would only push a good backup out of the last 20.
  if (maps.length === 0) return;
  const templates = loadTemplates();
  const signature = JSON.stringify([maps, templates]);
  if (signature === lastWritten) return;
  const now = new Date();
  const name = backupFileName(now);
  const text = JSON.stringify(serializeBackup(maps, now, templates), null, 2);
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

/** The newest backed-up version of each held map, from this app's files in
    `target`, newest first. A file that fails to read is skipped. */
export async function lastBackedUpCopies(target: Folder, held: readonly HeldMap[]): Promise<Map<MapId, LinkMap>> {
  const found = new Map<MapId, LinkMap>();
  const wanted = new Set(held.map((h) => h.id));
  const names: string[] = [];
  try {
    for await (const entry of target.values()) {
      if (entry.kind === "file") names.push(entry.name);
    }
  } catch {
    return found;
  }
  for (const name of backupsNewestFirst(names)) {
    if (found.size === wanted.size) break;
    try {
      const file = await (await target.getFileHandle(name)).getFile();
      takeCopies(found, JSON.parse(await file.text()), wanted, newPageSize());
    } catch {
      // One unreadable file must not end the search.
    }
  }
  return found;
}

/** "Restore last good version" on the banner: the held map's newest
    backed-up copy, from the folder. `null` when there is no folder, the
    browser refuses access, or no file has it. Must run from a click (the
    browser may ask to allow the folder again). */
export async function findLastGoodCopy(entry: HeldMap): Promise<LinkMap | null> {
  if (!folder) return null;
  try {
    if ((await folder.requestPermission({ mode: "readwrite" })) !== "granted") return null;
  } catch {
    return null;
  }
  return (await lastBackedUpCopies(folder, [entry])).get(entry.id) ?? null;
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
  tellOthers();
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
  tellOthers();
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
  tellOthers();
}
