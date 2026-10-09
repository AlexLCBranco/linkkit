/**
 * Boardkit's saved board, as Linkkit sees it. Pure: where it is stored
 * (`boardkit:board:<id>` on the shared gauntlet site) is the store's
 * business.
 *
 * The format is Boardkit's (its `src/domain/persistence.ts` and
 * `types.ts`), not Linkkit's. This module is the one place in Linkkit that
 * knows it, so a Boardkit format change touches one file here.
 *
 * Linkkit only reads and changes the fields a linked tree shares (titles,
 * statuses, list and card order, the trash). Every other field -- pregame
 * and postgame text, colours, dividers, the background -- rides along
 * untouched: items are kept whole, with whatever else they carry.
 *
 * Reading is strict on purpose. Boardkit repairs a damaged board when it
 * opens it; Linkkit never does, because writing back its own guess would
 * replace what Boardkit could still recover. A board that doesn't read
 * cleanly is "damaged", and Linkkit leaves it alone.
 */

/** The record version this build knows (Boardkit's `SCHEMA_VERSION`).
    Version 1 reads the same way, with no statuses and `rev` 0. */
export const BOARD_RECORD_VERSION = 2;

/** Boardkit's cap on a list (`MAX_CARDS_PER_LIST`), dividers and notes
    included. */
export const MAX_CARDS_PER_LIST = 50;

/** A list or card: its id and title, plus whatever else Boardkit keeps on
    it (`status`, `kind`, `color`, `description`, ...), kept as it is. */
export interface BoardItem {
  readonly id: string;
  readonly title: string;
  readonly [field: string]: unknown;
}

export interface BoardCardTrash {
  readonly cardId: string;
  readonly listId: string;
  readonly deletedAt: number;
  /** The cards just above and below it when it was deleted, so Boardkit's
      restore can put it back between them. */
  readonly prevCardId?: string | null;
  readonly nextCardId?: string | null;
}

export interface BoardListTrash {
  readonly listId: string;
  readonly deletedAt: number;
}

/** A board's content (Boardkit's `BoardState`), plus any other field it
    carries (`background`, `collapsedLists`, ...), kept as it is. */
export interface BoardContent {
  readonly lists: Readonly<Record<string, BoardItem>>;
  readonly cards: Readonly<Record<string, BoardItem>>;
  /** Lists left to right. A trashed list is left out. */
  readonly listOrder: readonly string[];
  /** Each list's cards top to bottom, dividers and notes included. A
      trashed card is left out; a trashed list keeps its entry whole. */
  readonly cardOrder: Readonly<Record<string, readonly string[]>>;
  readonly trash: readonly BoardCardTrash[];
  readonly trashedLists: readonly BoardListTrash[];
  readonly [field: string]: unknown;
}

/** The whole stored record: `{ version, rev, board }`. */
export interface BoardRecord {
  readonly version: number;
  /** Raised by one on every write, by either app (see `nextRecord`). */
  readonly rev: number;
  readonly board: BoardContent;
}

export type BoardRecordRead =
  | { readonly status: "ok"; readonly record: BoardRecord }
  /** Saved by a newer Boardkit: never written over (show it read-only). */
  | { readonly status: "newer" }
  /** Not a board this build can read cleanly: left for Boardkit to repair. */
  | { readonly status: "damaged" };

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

/** A stored record's `rev`, or 0 when it has none (version 1) or it isn't
    a whole number of at least 0. Boardkit's `revOf`. */
export function revOf(data: unknown): number {
  const rev = isRecord(data) ? data.rev : undefined;
  return typeof rev === "number" && Number.isSafeInteger(rev) && rev >= 0 ? rev : 0;
}

/** Whether a stored record was written by a newer Boardkit. */
export function isNewerRecord(data: unknown): boolean {
  const version = isRecord(data) ? data.version : undefined;
  return typeof version === "number" && version > BOARD_RECORD_VERSION;
}

function readItems(value: unknown): Record<string, BoardItem> | null {
  if (!isRecord(value)) return null;
  const items: Record<string, BoardItem> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "__proto__" || !isRecord(item) || item.id !== key || typeof item.title !== "string") return null;
    items[key] = item as BoardItem;
  }
  return items;
}

function readCardTrash(value: unknown): BoardCardTrash[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const ok = value.every(
    (e) => isRecord(e) && typeof e.cardId === "string" && typeof e.listId === "string" && typeof e.deletedAt === "number",
  );
  return ok ? (value as BoardCardTrash[]) : null;
}

function readListTrash(value: unknown): BoardListTrash[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const ok = value.every((e) => isRecord(e) && typeof e.listId === "string" && typeof e.deletedAt === "number");
  return ok ? (value as BoardListTrash[]) : null;
}

/**
 * Reads a stored board record (parsed JSON). `ok` only when every list and
 * card is whole and every id in the orders and the trash points at one;
 * anything less is `damaged`. (`trash` and `trashedLists` may be missing:
 * boards older than Boardkit's trash have none.)
 */
export function readBoardRecord(data: unknown): BoardRecordRead {
  if (isNewerRecord(data)) return { status: "newer" };
  if (!isRecord(data) || (data.version !== 1 && data.version !== 2) || !isRecord(data.board)) {
    return { status: "damaged" };
  }
  const raw = data.board;
  const lists = readItems(raw.lists);
  const cards = readItems(raw.cards);
  const trash = readCardTrash(raw.trash);
  const trashedLists = readListTrash(raw.trashedLists);
  if (!lists || !cards || !trash || !trashedLists) return { status: "damaged" };
  if (!isStringArray(raw.listOrder) || !raw.listOrder.every((id) => lists[id])) return { status: "damaged" };
  if (!isRecord(raw.cardOrder)) return { status: "damaged" };
  const cardOrder: Record<string, readonly string[]> = {};
  for (const [listId, ids] of Object.entries(raw.cardOrder)) {
    if (!lists[listId] || !isStringArray(ids) || !ids.every((id) => cards[id])) return { status: "damaged" };
    cardOrder[listId] = ids;
  }
  if (!trash.every((e) => cards[e.cardId]) || !trashedLists.every((e) => lists[e.listId])) {
    return { status: "damaged" };
  }
  const board: BoardContent = { ...raw, lists, cards, listOrder: raw.listOrder, cardOrder, trash, trashedLists };
  return { status: "ok", record: { version: data.version, rev: revOf(data), board } };
}

/**
 * What to store after changing `record`'s board to `board`: this build's
 * version, and `rev` one above the record it read. Raising `rev` is how a
 * Boardkit tab (and another Linkkit tab) knows the board changed under it.
 */
export function nextRecord(record: BoardRecord, board: BoardContent): BoardRecord {
  return { version: BOARD_RECORD_VERSION, rev: record.rev + 1, board };
}

/** Dividers and notes (Boardkit's card `kind`) stay in a list's order but
    are not boxes in Linkkit. A `kind` Boardkit doesn't know reads there as
    a normal card, so it does here too. */
export const isShownCard = (card: BoardItem | undefined): boolean =>
  !!card && card.kind !== "divider" && card.kind !== "note";
