/**
 * The pure rules behind automatic backup (copied from Boardkit's
 * `domain/backupStatus.ts`): what the files are called, which old ones to
 * delete, how a backup's age reads, and when the map menu needs a dot. No
 * storage, no clock of its own -- callers pass `now` in, so every rule here
 * is testable with fixed numbers.
 */

/** The state of automatic backup, from the user's side. */
export type AutoBackupStatus =
  /** This browser cannot write to a folder (Firefox, Safari). */
  | "unsupported"
  | "off"
  | "active"
  /** A folder is chosen but the browser wants one click to allow access
      again (after a restart). */
  | "needs-permission"
  /** The folder is gone, or writing to it failed. */
  | "folder-error";

/** Automatic backup keeps this many files in the folder. */
export const BACKUPS_TO_KEEP = 20;

/** How long after the last change a backup is written: a drag or a burst
    of typing makes one file, not dozens. */
export const BACKUP_QUIET_MS = 10_000;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "just now", "2 min ago", "3 hours ago", "9 days ago". */
export function formatBackupAge(lastBackupAt: number, now: number): string {
  const elapsed = Math.max(0, now - lastBackupAt);
  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`;
  if (elapsed < DAY_MS) return ago(Math.floor(elapsed / HOUR_MS), "hour");
  return ago(Math.floor(elapsed / DAY_MS), "day");
}

function ago(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

/** Whether the map menu's button shows a dot: only when automatic backup
    has stopped and needs the user (a click to resume, or a new folder).
    Backups never stop silently. */
export function backupNeedsAttention(status: AutoBackupStatus): boolean {
  return status === "needs-permission" || status === "folder-error";
}

/** Automatic backups are named apart from "Export all maps" files
    (`linkkit-maps-<date>.json`) so rotation can never delete one of those;
    the content is the same format, so restoring reads either. */
const FILE_NAME = /^linkkit-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/;

/** `linkkit-backup-2026-10-06-1432.json`: local time, and sorts
    oldest-first as plain text. */
export function backupFileName(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `linkkit-backup-${day}-${two(date.getHours())}${two(date.getMinutes())}.json`;
}

/**
 * Which files rotation should delete: the oldest automatic backups beyond
 * `keep`. Only names this app writes are considered, so anything else in the
 * folder (exports, Boardkit's backups, the user's own files) is never
 * touched, and `justWritten` is never offered even if a clock jump made it
 * sort oldest.
 */
export function backupsToDelete(
  names: readonly string[],
  justWritten: string,
  keep: number = BACKUPS_TO_KEEP,
): string[] {
  const ours = names.filter((name) => FILE_NAME.test(name) && name !== justWritten).sort();
  return ours.slice(0, Math.max(0, ours.length - (keep - 1)));
}
