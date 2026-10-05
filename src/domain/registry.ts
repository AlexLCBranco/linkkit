import { UNTITLED_MAP } from "./persistence";
import type { MapId } from "./types";

/**
 * The index of saved maps: what the map switcher lists. Kept apart from
 * the maps themselves (like Treekit's tree registry), so listing maps never
 * means reading and parsing every map in storage.
 *
 * Stored oldest-first (creation order); the switcher shows it newest-first.
 */
export interface MapSummary {
  readonly id: MapId;
  readonly name: string;
}

export type Registry = readonly MapSummary[];

export const REGISTRY_VERSION = 1;

export interface PersistedRegistry {
  readonly version: typeof REGISTRY_VERSION;
  readonly maps: Registry;
}

export function serializeRegistry(registry: Registry): PersistedRegistry {
  return { version: REGISTRY_VERSION, maps: registry.map(({ id, name }) => ({ id, name })) };
}

/** `null` when the data is not a registry at all; bad entries are skipped. */
export function readRegistry(data: unknown): Registry | null {
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as Record<string, unknown>;
  if (candidate.version !== REGISTRY_VERSION || !Array.isArray(candidate.maps)) return null;
  const seen = new Set<string>();
  const maps: MapSummary[] = [];
  for (const entry of candidate.maps as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    maps.push({ id: id as MapId, name: typeof name === "string" && name.trim() ? name : UNTITLED_MAP });
  }
  return maps;
}

/** Adds a map at the end, or updates its name in place if listed. Returns
    the same registry when nothing changed. */
export function upsertMap(registry: Registry, summary: MapSummary): Registry {
  const index = registry.findIndex((m) => m.id === summary.id);
  if (index === -1) return [...registry, { id: summary.id, name: summary.name }];
  if (registry[index].name === summary.name) return registry;
  return registry.map((m, i) => (i === index ? { id: summary.id, name: summary.name } : m));
}

export function removeMap(registry: Registry, id: MapId): Registry {
  return registry.some((m) => m.id === id) ? registry.filter((m) => m.id !== id) : registry;
}

/** The name for a copy of `name`: "X (copy)", then "X (copy 2)", ... so the
    list never shows two maps with the same name after a duplicate. */
export function copyName(name: string, registry: Registry): string {
  const taken = new Set(registry.map((m) => m.name));
  const first = `${name} (copy)`;
  if (!taken.has(first)) return first;
  for (let n = 2; ; n++) {
    const candidate = `${name} (copy ${n})`;
    if (!taken.has(candidate)) return candidate;
  }
}
