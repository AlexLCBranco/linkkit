import { readBoardRecord, type BoardRecord, type BoardRecordRead } from "../domain/boardRecord";

/**
 * The only module that touches Boardkit's keys (shared store, bridge step
 * 3). On the shared gauntlet site both apps have one localStorage:
 *
 *   boardkit:board:<id>  one board's record (`domain/boardRecord.ts`)
 *   boardkit:registry    Boardkit's board list: `{ version: 1, boards:
 *                        [{ id, name }], activeBoardId }`. A board's name
 *                        lives only here
 *
 * Linkkit reads both and writes only what a linked tree shares: a board's
 * record (through `nextRecord`, so its `rev` goes up) and a board's name in
 * the list. Every other field of either is written back exactly as read.
 * Failures throw: the caller (`persistMap.ts`) decides what a failed save
 * means.
 */
const BOARD_KEY_PREFIX = "boardkit:board:";
const BOARD_LIST_KEY = "boardkit:registry";

export const boardKey = (boardId: string): string => BOARD_KEY_PREFIX + boardId;

/** The board id a storage key holds, or `null` for any other key. */
export function boardIdOfKey(key: string): string | null {
  return key.startsWith(BOARD_KEY_PREFIX) ? key.slice(BOARD_KEY_PREFIX.length) : null;
}

/** Whether a storage key is Boardkit's board list. */
export const isBoardListKey = (key: string): boolean => key === BOARD_LIST_KEY;

/** A stored board: `missing` when there is none (deleted in Boardkit). */
export type StoredBoard = BoardRecordRead | { readonly status: "missing" };

export function loadBoard(boardId: string): StoredBoard {
  const raw = localStorage.getItem(boardKey(boardId));
  if (raw === null) return { status: "missing" };
  try {
    return readBoardRecord(JSON.parse(raw));
  } catch {
    return { status: "damaged" };
  }
}

/** Stores a board record. Throws when storage refuses it. */
export function writeBoard(boardId: string, record: BoardRecord): void {
  localStorage.setItem(boardKey(boardId), JSON.stringify(record));
}

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);

/** Boardkit's list, as stored, when it reads as one. */
function storedList(): (Raw & { boards: Raw[] }) | null {
  const raw = localStorage.getItem(BOARD_LIST_KEY);
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.boards)) return null;
    if (!data.boards.every((b) => isRecord(b) && typeof b.id === "string" && typeof b.name === "string")) return null;
    return data as Raw & { boards: Raw[] };
  } catch {
    return null;
  }
}

/** A board's name in Boardkit's list, or `null` when the list doesn't
    have it. */
export function loadBoardName(boardId: string): string | null {
  const entry = storedList()?.boards.find((b) => b.id === boardId);
  return entry ? (entry.name as string) : null;
}

/**
 * Renames a board in Boardkit's list: read, change that one name, write
 * back, so whatever else the list holds stays (Boardkit's tabs merge it in
 * through the `storage` event). Nothing is written when the list doesn't
 * read, or doesn't have the board. Throws when storage refuses it.
 */
export function writeBoardName(boardId: string, name: string): void {
  const list = storedList();
  if (!list) return;
  const index = list.boards.findIndex((b) => b.id === boardId);
  if (index === -1 || list.boards[index].name === name) return;
  const boards = list.boards.map((b, i) => (i === index ? { ...b, name } : b));
  localStorage.setItem(BOARD_LIST_KEY, JSON.stringify({ ...list, boards }));
}
