import { readBackup } from "./backup";
import type { LinkMap, MapId, Size } from "./types";

/**
 * Maps held back from automatic backups (Boardkit's rule, owner's decision
 * 2026-10-18). A map whose saved text was damaged opens repaired, or not at
 * all; backing up that repair would, after 20 files, push its last good
 * version out of the folder. So while a map is held, each new backup
 * carries its last backed-up version forward instead, every other map is
 * backed up as usual, and the app says so on screen. The hold ends only by
 * the user's choice: keep the repair, or restore the last good version.
 *
 * Pure: the list is stored under `linkkit:held` by `store/backupHold.ts`.
 */
export interface HeldMap {
  readonly id: MapId;
  /** The map's name in the list when it was found damaged (the repair may
      have lost the name itself). */
  readonly name: string;
  /** When it was found damaged. */
  readonly at: number;
  /** The localStorage key holding its damaged original, or `null` if it
      couldn't be kept aside. */
  readonly aside: string | null;
  /** True: it opened repaired. False: nothing could be read. */
  readonly repaired: boolean;
}

export const HELD_VERSION = 1;

export function serializeHeld(held: readonly HeldMap[]): { version: number; maps: readonly HeldMap[] } {
  return { version: HELD_VERSION, maps: held };
}

/** The stored list; anything not whole is dropped (a lost entry only means
    that map is backed up as it is now, as before this list existed). */
export function readHeld(data: unknown): HeldMap[] {
  if (typeof data !== "object" || data === null) return [];
  const { version, maps } = data as { version?: unknown; maps?: unknown };
  if (version !== HELD_VERSION || !Array.isArray(maps)) return [];
  const held: HeldMap[] = [];
  for (const entry of maps as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name, at, aside, repaired } = entry as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string" || typeof at !== "number") continue;
    if (aside !== null && typeof aside !== "string") continue;
    if (typeof repaired !== "boolean") continue;
    if (held.some((h) => h.id === id)) continue;
    held.push({ id: id as MapId, name, at, aside, repaired });
  }
  return held;
}

/** Adds `entry`, or leaves an existing hold as it was: the first damage
    found is the one that matters (its original, its time). An earlier
    entry that couldn't keep its original aside takes this one's. */
export function withHeld(held: readonly HeldMap[], entry: HeldMap): readonly HeldMap[] {
  const existing = held.find((h) => h.id === entry.id);
  if (!existing) return [...held, entry];
  if (existing.aside === null && entry.aside !== null) {
    return held.map((h) => (h.id === entry.id ? { ...h, aside: entry.aside } : h));
  }
  return held;
}

export function withoutHeld(held: readonly HeldMap[], id: MapId): readonly HeldMap[] {
  return held.some((h) => h.id === id) ? held.filter((h) => h.id !== id) : held;
}

/**
 * Takes, from one parsed backup file, the maps in `wanted` that `found`
 * doesn't have yet. Called on files newest first, so each map ends up with
 * its newest backed-up version. A file that isn't a backup adds nothing.
 */
export function takeCopies(
  found: Map<MapId, LinkMap>,
  data: unknown,
  wanted: ReadonlySet<MapId>,
  fallbackPage: Size,
): void {
  const read = readBackup(data, fallbackPage);
  if (read.status !== "ok") return;
  for (const map of read.maps) {
    if (wanted.has(map.id) && !found.has(map.id)) found.set(map.id, map);
  }
}

/** The maps to back up: a held map's last backed-up copy in place of what
    it reads as now (its repair), or the repair if no file has it yet; an
    unreadable one with no copy is left out (it isn't in `maps`). The
    list's order is kept, and a carried map whose entry is gone from the
    list (unreadable, so opening it removed it) goes last. */
export function withHeldBack(maps: readonly LinkMap[], held: readonly HeldMap[], copies: ReadonlyMap<MapId, LinkMap>): LinkMap[] {
  const carried = new Set(copies.keys());
  const out = maps.map((map) => {
    const entry = held.find((h) => h.id === map.id);
    return entry && heldOutcome(entry, carried) === "carried" ? (copies.get(map.id) ?? map) : map;
  });
  for (const [id, copy] of copies) if (!out.some((m) => m.id === id)) out.push(copy);
  return out;
}

const quoted = (names: readonly string[]) => names.map((n) => `“${n}”`).join(", ");

/**
 * What a backup holds for each held map: its last backed-up version when a
 * file has one ("carried"); else, for a repaired map, the repair, since it
 * beats nothing ("repair"); else nothing ("left out", it can't be read).
 */
export type HeldOutcome = "carried" | "repair" | "left-out";

export function heldOutcome(entry: HeldMap, carried: ReadonlySet<MapId>): HeldOutcome {
  if (carried.has(entry.id)) return "carried";
  return entry.repaired ? "repair" : "left-out";
}

/** What the backup menu and the banner say about held maps, or `null`
    (Boardkit's wording). */
export function heldBackWarning(held: readonly HeldMap[], carried: ReadonlySet<MapId>): string | null {
  if (held.length === 0) return null;
  const named = (outcome: HeldOutcome) => held.filter((h) => heldOutcome(h, carried) === outcome).map((h) => h.name);
  const kept = named("carried");
  const repair = named("repair");
  const left = named("left-out");
  const parts: string[] = [];
  if (kept.length > 0) {
    parts.push(`${quoted(kept)} ${kept.length === 1 ? "was" : "were"} damaged, so new backups keep ${kept.length === 1 ? "its" : "their"} last backed-up version.`);
  }
  if (repair.length > 0) {
    parts.push(`${quoted(repair)} ${repair.length === 1 ? "was" : "were"} damaged and ${repair.length === 1 ? "isn't" : "aren't"} in any earlier backup, so backups keep the repaired version.`);
  }
  if (left.length > 0) {
    parts.push(`${quoted(left)} ${left.length === 1 ? "was" : "were"} damaged and ${left.length === 1 ? "isn't" : "aren't"} in any backup yet, so ${left.length === 1 ? "it's" : "they're"} left out.`);
  }
  parts.push("Other maps are backed up as usual.");
  return parts.join(" ");
}
