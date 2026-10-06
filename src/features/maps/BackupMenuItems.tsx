import { useState } from "react";

import { DropdownMenuItem, DropdownMenuLabel } from "../../components/ui/dropdown-menu";
import { formatBackupAge } from "../../domain/autoBackup";
import { useBackupStore } from "../../store/backupStore";
import { chooseBackupFolder, isAutoBackupSupported, resumeBackups, turnOffAutoBackup } from "./autoBackup";
import { exportAllMaps } from "./backupFile";

/**
 * The map menu's backup items (Boardkit's `BackupMenuItems`): one line
 * saying how backups stand, with the action that fits -- "Back up now" (an
 * export) while automatic backup isn't running, "Resume backups" after a
 * restart, "Choose folder…" when the folder is gone -- plus "Automatic
 * backup…" and "Turn off automatic backup" where the browser can write to
 * a folder. In Firefox and Safari only the first line shows: there the
 * export is the backup, and the line is the 7-day reminder's way to it.
 *
 * Menu content mounts when the menu opens, so the age is read fresh each
 * time it opens, without a ticking clock.
 */
export function BackupMenuItems() {
  const status = useBackupStore((s) => s.status);
  const folderName = useBackupStore((s) => s.folderName);
  const lastBackupAt = useBackupStore((s) => s.lastBackupAt);
  const note = useBackupStore((s) => s.note);
  // Read once as the menu opens (its content mounts then).
  const [openedAt] = useState(() => Date.now());
  const age = lastBackupAt === null ? null : formatBackupAge(lastBackupAt, openedAt);
  const supported = isAutoBackupSupported();

  return (
    <>
      {(status === "off" || status === "unsupported") && (
        <DropdownMenuItem onSelect={exportAllMaps}>
          Last backup: {age ?? "never"} · <span className="font-medium">Back up now</span>
        </DropdownMenuItem>
      )}
      {status === "active" && (
        <DropdownMenuLabel className="font-normal">
          Backing up to “{folderName}” · last {age ?? "not yet"}
        </DropdownMenuLabel>
      )}
      {status === "needs-permission" && (
        <DropdownMenuItem onSelect={() => void resumeBackups()}>
          Backups paused · <span className="font-medium">Resume backups</span>
        </DropdownMenuItem>
      )}
      {status === "folder-error" && (
        <DropdownMenuItem onSelect={() => void chooseBackupFolder()}>
          Can’t write to the backup folder · <span className="font-medium">Choose folder…</span>
        </DropdownMenuItem>
      )}
      {note && <DropdownMenuLabel className="font-normal">{note}</DropdownMenuLabel>}
      {supported && (
        <DropdownMenuItem onSelect={() => void chooseBackupFolder()}>
          {status === "off" ? "Automatic backup…" : "Back up to another folder…"}
        </DropdownMenuItem>
      )}
      {supported && status !== "off" && status !== "unsupported" && (
        <DropdownMenuItem onSelect={() => void turnOffAutoBackup()}>Turn off automatic backup</DropdownMenuItem>
      )}
    </>
  );
}
