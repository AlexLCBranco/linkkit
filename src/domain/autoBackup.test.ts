import { describe, expect, it } from "vitest";

import {
  BACKUP_STALE_AFTER_MS,
  backupFileName,
  backupNeedsAttention,
  backupsToDelete,
  formatBackupAge,
  isBackupStale,
} from "./autoBackup";

describe("backupFileName", () => {
  it("names a file by local date and time, zero-padded", () => {
    expect(backupFileName(new Date(2026, 0, 5, 9, 7))).toBe("linkkit-backup-2026-01-05-0907.json");
  });
});

describe("backupsToDelete", () => {
  const backup = (minute: number) => `linkkit-backup-2026-10-06-10${String(minute).padStart(2, "0")}.json`;

  it("keeps the newest ones, counting the file just written", () => {
    const names = [backup(1), backup(2), backup(3), backup(4)];
    expect(backupsToDelete([...names, backup(5)], backup(5), 3)).toEqual([backup(1), backup(2)]);
  });

  it("deletes nothing while there are fewer than the limit", () => {
    expect(backupsToDelete([backup(1), backup(2)], backup(2), 3)).toEqual([]);
  });

  it("never touches exports, Boardkit's backups or other files", () => {
    const others = ["linkkit-maps-2026-10-01.json", "boardkit-backup-2026-10-06-1000.json", "notes.txt"];
    expect(backupsToDelete([...others, backup(1), backup(2)], backup(2), 1)).toEqual([backup(1)]);
  });

  it("never offers the file just written, whatever its name sorts as", () => {
    const old = "linkkit-backup-2020-01-01-0000.json";
    expect(backupsToDelete([old, backup(1)], old, 1)).toEqual([backup(1)]);
  });
});

describe("formatBackupAge", () => {
  const now = 1_000_000_000_000;
  it("reads like a person would say it", () => {
    expect(formatBackupAge(now - 10_000, now)).toBe("just now");
    expect(formatBackupAge(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(formatBackupAge(now - 60 * 60_000, now)).toBe("1 hour ago");
    expect(formatBackupAge(now - 3 * 24 * 60 * 60_000, now)).toBe("3 days ago");
  });
});

describe("isBackupStale", () => {
  const now = 1_000_000_000_000;
  it("is stale when there was never a backup, or the last is over 7 days old", () => {
    expect(isBackupStale(null, now)).toBe(true);
    expect(isBackupStale(now - BACKUP_STALE_AFTER_MS - 1, now)).toBe(true);
    expect(isBackupStale(now - BACKUP_STALE_AFTER_MS, now)).toBe(false);
    expect(isBackupStale(now - 60_000, now)).toBe(false);
  });
});

describe("backupNeedsAttention", () => {
  const now = 1_000_000_000_000;
  const old = now - BACKUP_STALE_AFTER_MS - 1;
  const fresh = now - 60_000;
  type Status = Parameters<typeof backupNeedsAttention>[0]["status"];
  const ask = (status: Status, lastBackupAt: number | null, empty = false) =>
    backupNeedsAttention({ status, lastBackupAt, now, empty });

  it("always when automatic backup has stopped and needs the user", () => {
    expect(ask("needs-permission", fresh)).toBe(true);
    expect(ask("folder-error", fresh)).toBe(true);
    expect(ask("folder-error", null, true)).toBe(true);
  });

  it("never while automatic backup is working, however old its last file", () => {
    expect(ask("active", old)).toBe(false);
    expect(ask("active", null)).toBe(false);
  });

  it("otherwise reminds after 7 days, or when there was never a backup", () => {
    expect(ask("off", old)).toBe(true);
    expect(ask("off", null)).toBe(true);
    expect(ask("unsupported", old)).toBe(true);
    expect(ask("off", fresh)).toBe(false);
    expect(ask("unsupported", fresh)).toBe(false);
  });

  it("not while there is only the untouched first-visit example", () => {
    expect(ask("off", null, true)).toBe(false);
    expect(ask("unsupported", old, true)).toBe(false);
  });
});
