import { readMap, serializeMap, type MapRead } from "../domain/persistence";
import { readRegistry, removeMap, serializeRegistry, upsertMap, type Registry } from "../domain/registry";
import type { LinkMap, MapId, Size } from "../domain/types";

/**
 * The only module that touches localStorage for maps. `domain/` owns the
 * saved shapes and their validation; this owns where they live:
 *
 *   linkkit:map:<id>   one map
 *   linkkit:registry   the list of maps (ids and names, creation order)
 *   linkkit:active     the id of the map that was open last
 *   linkkit:starter    the example a first-ever visit opened, while it is
 *                      still untouched (see `loadStarterId`)
 *   linkkit:damaged:…  a damaged map's original text, kept aside
 *
 * (`linkkit:align` belongs to `viewStore.ts`.) Every key starts with
 * "linkkit:" because the shared gauntlet site gives Linkkit and Boardkit
 * one localStorage between them.
 *
 * Every write is wrapped: storage can fail (quota, private browsing)
 * without that being fatal -- the app keeps working in memory.
 */
const MAP_KEY_PREFIX = "linkkit:map:";
const REGISTRY_KEY = "linkkit:registry";
const ACTIVE_KEY = "linkkit:active";
const DAMAGED_KEY_PREFIX = "linkkit:damaged:";
const STARTER_KEY = "linkkit:starter";

/** What the list shows for a stored map that cannot be read at all. */
const DAMAGED_MAP_NAME = "Damaged map";

function tryWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // See the module comment: failing to save is not fatal.
  }
}

function parse(raw: string, fallbackPage: Size): MapRead {
  try {
    return readMap(JSON.parse(raw), fallbackPage);
  } catch {
    return { status: "unreadable" };
  }
}

function storedMapIds(): MapId[] {
  const ids: MapId[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(MAP_KEY_PREFIX)) ids.push(key.slice(MAP_KEY_PREFIX.length) as MapId);
  }
  return ids;
}

function writeRegistry(registry: Registry): void {
  tryWrite(REGISTRY_KEY, JSON.stringify(serializeRegistry(registry)));
}

/**
 * The list of saved maps, reconciled with what is actually stored: an entry
 * whose map is gone is dropped, and a stored map the list does not know is
 * added. That also covers the map saved before the list existed (v0.0.6
 * and earlier), and a list lost or damaged on its own.
 */
export function loadRegistry(): Registry {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    let registry: Registry = [];
    if (raw !== null) {
      try {
        registry = readRegistry(JSON.parse(raw)) ?? [];
      } catch {
        registry = [];
      }
    }
    const stored = new Set(storedMapIds());
    let reconciled: Registry = registry.filter((m) => stored.has(m.id));
    for (const id of stored) {
      if (reconciled.some((m) => m.id === id)) continue;
      // Only the name is needed, so the page size passed here never matters.
      const read = parse(localStorage.getItem(MAP_KEY_PREFIX + id) ?? "", { width: 1, height: 1 });
      reconciled = upsertMap(reconciled, { id, name: read.status === "unreadable" ? DAMAGED_MAP_NAME : read.map.name });
    }
    if (reconciled.length !== registry.length || reconciled.some((m, i) => m !== registry[i])) {
      writeRegistry(reconciled);
    }
    return reconciled;
  } catch {
    return [];
  }
}

/** Writes a map and keeps its list entry (name) in step. */
export function saveMap(map: LinkMap): void {
  tryWrite(MAP_KEY_PREFIX + map.id, JSON.stringify(serializeMap(map)));
  writeRegistry(upsertMap(loadRegistry(), { id: map.id, name: map.name }));
}

export function deleteStoredMap(id: MapId): void {
  try {
    localStorage.removeItem(MAP_KEY_PREFIX + id);
  } catch {
    // Nothing to do: the list below still forgets it.
  }
  writeRegistry(removeMap(loadRegistry(), id));
}

export function loadActiveMapId(): MapId | null {
  try {
    return localStorage.getItem(ACTIVE_KEY) as MapId | null;
  } catch {
    return null;
  }
}

export function saveActiveMapId(id: MapId): void {
  tryWrite(ACTIVE_KEY, id);
}

/**
 * The example map a first-ever visit opened, remembered until it is first
 * changed. While it is the only map, Linkkit counts as empty: "Restore all
 * maps from a file" is offered, and restoring takes the untouched example
 * away (nothing of the user's is lost).
 */
export function loadStarterId(): MapId | null {
  try {
    return localStorage.getItem(STARTER_KEY) as MapId | null;
  } catch {
    return null;
  }
}

export function saveStarterId(id: MapId | null): void {
  if (id !== null) {
    tryWrite(STARTER_KEY, id);
    return;
  }
  try {
    localStorage.removeItem(STARTER_KEY);
  } catch {
    // Not fatal: at worst the restore is offered once more.
  }
}

/**
 * Reads one map, or `null` if it is missing or nothing could be salvaged.
 *
 * A damaged map still opens, repaired as far as possible -- but first its
 * saved text is copied, untouched, to a `linkkit:damaged:` key, because the
 * next auto-save overwrites the map's own key. Without that copy,
 * "repaired" would quietly mean "whatever the repair kept".
 */
export function loadMap(id: MapId, fallbackPage: Size): LinkMap | null {
  try {
    const raw = localStorage.getItem(MAP_KEY_PREFIX + id);
    if (raw === null) return null;
    const read = parse(raw, fallbackPage);
    if (read.status === "ok") return read.map;

    const asideKey = `${DAMAGED_KEY_PREFIX}${id}:${Date.now()}`;
    tryWrite(asideKey, raw);
    console.warn(
      read.status === "repaired"
        ? `Linkkit: a saved map was damaged and has been repaired (${read.fixes} fixes). The original is kept in localStorage under "${asideKey}".`
        : `Linkkit: a saved map could not be read. It is kept in localStorage under "${asideKey}".`,
    );
    return read.status === "repaired" ? read.map : null;
  } catch {
    return null;
  }
}
