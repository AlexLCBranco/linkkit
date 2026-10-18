import { create } from "zustand";

import { readHeld, serializeHeld, withHeld, withoutHeld, type HeldMap } from "../domain/held";
import type { MapId } from "../domain/types";

/**
 * The maps held back from automatic backups (`domain/held.ts`), stored under
 * `linkkit:held` so the hold survives a reload and reaches every tab and
 * frame on the site: the warning shows wherever a held map is open, not only
 * in the tab that found the damage.
 *
 * Every change reads the stored list fresh before writing, so two tabs
 * adding at once don't drop each other's entry.
 */
const HELD_KEY = "linkkit:held";

export function loadHeld(): HeldMap[] {
  try {
    return readHeld(JSON.parse(localStorage.getItem(HELD_KEY) ?? "null"));
  } catch {
    return [];
  }
}

function store(held: readonly HeldMap[]): void {
  try {
    if (held.length === 0) localStorage.removeItem(HELD_KEY);
    else localStorage.setItem(HELD_KEY, JSON.stringify(serializeHeld(held)));
  } catch {
    // Storage full or blocked: the hold lives in memory this session. The
    // map is found damaged again next time it is read, so it comes back.
  }
  useBackupHold.setState({ held });
}

/** Called by `persistMap.ts` when a stored map reads damaged. */
export function markHeld(entry: HeldMap): void {
  const before = loadHeld();
  const after = withHeld(before, entry);
  if (after !== before) store(after);
}

/** Ends a hold: the user kept the repair, or restored the last good copy. */
export function releaseHeld(id: MapId): void {
  const before = loadHeld();
  const after = withoutHeld(before, id);
  if (after !== before) store(after);
}

interface BackupHoldState {
  readonly held: readonly HeldMap[];
}

export const useBackupHold = create<BackupHoldState>(() => ({ held: loadHeld() }));

/** Follows other tabs' and frames' changes to the list. Called once from
    `main.tsx`. */
export function initBackupHold(): void {
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== localStorage) return;
    if (event.key === HELD_KEY || event.key === null) useBackupHold.setState({ held: loadHeld() });
  });
}
