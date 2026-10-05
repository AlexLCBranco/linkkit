import { readMap, serializeMap, type MapRead } from "../domain/persistence";
import type { LinkMap, MapId, Size } from "../domain/types";

/**
 * The only module that touches localStorage for maps. `domain/` owns the
 * saved shape and its validation; this owns where it lives:
 *
 *   linkkit:map:<id>   one map
 *   linkkit:active     the id of the map that was open last
 *
 * One key per map from the start, so "several saved maps" (step 8) only
 * adds a list of them, without moving any saved data.
 *
 * Every write is wrapped: storage can fail (quota, private browsing)
 * without that being fatal -- the app keeps working in memory.
 */
const MAP_KEY_PREFIX = "linkkit:map:";
const ACTIVE_KEY = "linkkit:active";
const DAMAGED_KEY_PREFIX = "linkkit:damaged:";

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

export function saveMap(map: LinkMap): void {
  tryWrite(MAP_KEY_PREFIX + map.id, JSON.stringify(serializeMap(map)));
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
