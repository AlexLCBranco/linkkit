import { create } from "zustand";

import type { AutoBackupStatus } from "../domain/autoBackup";

/**
 * How automatic backup is doing, for the map menu (copied from Boardkit's
 * `backupStore`). Kept apart from `mapStore` because none of it belongs to
 * a map: it is per browser, and never part of a map's undo or saved content.
 *
 * `lastBackupAt` is the only piece that survives a reload (its own key,
 * below). The folder handle lives in IndexedDB; the status is rebuilt from
 * it at startup by `features/maps/autoBackup.ts`.
 */
const STORAGE_KEY = "linkkit:lastBackupAt";

function loadLastBackupAt(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

interface BackupState {
  readonly lastBackupAt: number | null;
  readonly status: AutoBackupStatus;
  /** The chosen folder's name, for display. */
  readonly folderName: string | null;
  /** Something the menu should say about backups right now (the folder
      couldn't be remembered, or opened), or `null`. */
  readonly note: string | null;
  markBackedUp: (at: number) => void;
  setAuto: (status: AutoBackupStatus, folderName: string | null) => void;
  setNote: (note: string | null) => void;
}

export const useBackupStore = create<BackupState>((set) => ({
  lastBackupAt: loadLastBackupAt(),
  status: "off",
  folderName: null,
  note: null,
  markBackedUp: (at) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(at));
    } catch {
      // Storage full: the age just lives in memory this session.
    }
    set({ lastBackupAt: at });
  },
  setAuto: (status, folderName) => set({ status, folderName }),
  setNote: (note) => set({ note }),
}));
