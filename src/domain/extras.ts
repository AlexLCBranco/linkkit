/**
 * Fields this build doesn't know, kept as they are (forward compatibility).
 *
 * A newer Linkkit may add a field to a map, a box, an arrow or a trash
 * entry. An older Linkkit still open in another tab reads that record,
 * changes something and saves it again: if it only copied the fields it
 * knows, the newer field would be gone. So every read keeps the unknown
 * fields of each record (`unknownFields`) on the object, every edit
 * carries them along (edits spread the old object), and every save writes
 * them back. Only whole, JSON-read values ride along: nothing here is
 * looked at or changed.
 *
 * The lists name every field this build reads; a new field must be added
 * to its list, or it would be read twice (once known, once as "unknown").
 */

export const MAP_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "name",
  "kind",
  "page",
  "direction",
  "arrowLength",
  "nodes",
  "links",
  "order",
  "hideCut",
  "collapsed",
  "trash",
  "linkedBoard",
]);

export const NODE_FIELDS: ReadonlySet<string> = new Set(["id", "name", "x", "y", "color", "status", "notes"]);

export const LINK_FIELDS: ReadonlySet<string> = new Set(["id", "from", "to", "label"]);

export const TRASH_ENTRY_FIELDS: ReadonlySet<string> = new Set(["deletedAt", "nodes", "links", "places"]);

export type Extras = Readonly<Record<string, unknown>>;

/** The fields of `record` not in `known`, as they are (never `__proto__`,
    which would set an object's prototype rather than add a field). */
export function unknownFields(record: object, known: ReadonlySet<string>): Extras {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!known.has(key) && key !== "__proto__" && value !== undefined) out[key] = value;
  }
  return out;
}

/** Whether `record` carries any field not in `known`. */
export const hasUnknownFields = (record: object, known: ReadonlySet<string>): boolean =>
  Object.keys(record).some((key) => !known.has(key) && key !== "__proto__");
