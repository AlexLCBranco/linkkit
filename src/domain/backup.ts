import { readMap, serializeMap, type PersistedMap } from "./persistence";
import type { Registry } from "./registry";
import type { LinkMap, Size } from "./types";

/**
 * "Export all maps" writes one file holding every map; "Restore all maps
 * from a file" reads it back. Pure: the download and the file picker are
 * the UI's business, where maps are stored is the store's.
 *
 * Each map inside is exactly what localStorage holds for it (a
 * `PersistedMap`), so reading one back reuses `readMap`, with all its
 * checks and repairs.
 */
export const BACKUP_FORMAT = "linkkit-maps";
export const BACKUP_VERSION = 1;

export interface Backup {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: typeof BACKUP_VERSION;
  /** When it was made (ISO time): for the owner, never read back. */
  readonly exportedAt: string;
  /** Oldest first, like the list of maps. */
  readonly maps: readonly PersistedMap[];
}

export function serializeBackup(maps: readonly LinkMap[], exportedAt: Date): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: exportedAt.toISOString(), maps: maps.map((map) => serializeMap(map)) };
}

export type BackupRead =
  /** `damaged`: maps in the file that could not be read at all. */
  | { readonly status: "ok"; readonly maps: readonly LinkMap[]; readonly damaged: number }
  | { readonly status: "not-a-backup" };

/** Reads a backup file's contents. A map that appears twice is kept once. */
export function readBackup(data: unknown, fallbackPage: Size): BackupRead {
  if (typeof data !== "object" || data === null) return { status: "not-a-backup" };
  const file = data as Record<string, unknown>;
  if (file.format !== BACKUP_FORMAT || file.version !== BACKUP_VERSION || !Array.isArray(file.maps)) {
    return { status: "not-a-backup" };
  }
  const maps: LinkMap[] = [];
  let damaged = 0;
  for (const entry of file.maps as unknown[]) {
    const read = readMap(entry, fallbackPage);
    if (read.status === "unreadable") damaged++;
    // A map comes back from a file as an ordinary map, never linked (a
    // file never holds a linked one; this guards one edited by hand).
    else if (!maps.some((m) => m.id === read.map.id)) {
      const { linkedBoard: _, ...map } = read.map;
      maps.push(map);
    }
  }
  return { status: "ok", maps, damaged };
}

/**
 * Which maps from a backup to add: only those not already here, matched by
 * id. That is what makes restoring never overwrite a map, and restoring
 * the same file twice add nothing the second time.
 */
export function mapsToRestore(
  existing: Registry,
  incoming: readonly LinkMap[],
): { readonly add: readonly LinkMap[]; readonly alreadyHere: number } {
  const here = new Set(existing.map((m) => m.id));
  const add = incoming.filter((m) => !here.has(m.id));
  return { add, alreadyHere: incoming.length - add.length };
}
