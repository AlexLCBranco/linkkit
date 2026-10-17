/**
 * Which maps the switcher menu lists. With no search typed: the `recent`
 * newest, the rest under "All maps". With a search: every map whose shown
 * name contains it (any case, any spacing at the ends), newest first, and
 * nothing under "All maps".
 */

export const RECENT_MAPS = 8;

export interface MapRow {
  readonly id: string;
  readonly name: string;
}

export interface MapMenuList<T extends MapRow> {
  /** Listed straight in the menu. */
  readonly shown: readonly T[];
  /** Listed under "All maps ▸" (empty: no such row). */
  readonly more: readonly T[];
}

/** `newestFirst` is every map, newest first, with the names the menu shows. */
export function mapMenuList<T extends MapRow>(
  newestFirst: readonly T[],
  query: string,
  recent = RECENT_MAPS,
): MapMenuList<T> {
  const q = query.trim().toLowerCase();
  if (q) return { shown: newestFirst.filter((m) => m.name.toLowerCase().includes(q)), more: [] };
  return { shown: newestFirst.slice(0, recent), more: newestFirst.slice(recent) };
}
