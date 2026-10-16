import { createLinkId, createNodeId, createPlayerId } from "./ids";
import { cleanName, createMap } from "./map";
import type { Link, LinkId, LinkMap, MapId, MapNode, Match, NodeId, Player, PlayerId, Size } from "./types";

/**
 * Bracket mode: a single-elimination tournament, on the same boxes and
 * arrows as every map (owner's spec, `reference/bracket-spec.md`). The
 * rules live in rules.ts (`bracket`: the structure is fixed); this file
 * holds what only a bracket needs, all pure:
 *
 *  - `createBracket`: every match of a 4- to 256-player bracket at once;
 *  - `renamePlayer` / `pasteNames`: typing the first round's names;
 *  - `pickWinner` / `setWinner`: a result, moving the winner on, and
 *    clearing every later result that stood on the old one;
 *  - `repairBracket`: a saved bracket put back in order on load.
 *
 * Each match is a box (`MapNode.match`); each player is stored once
 * (`LinkMap.players`) and slots hold player ids, never names, so a rename
 * shows everywhere the player has reached. Match `index` of round `r`
 * feeds match `index >> 1` of round `r + 1`, into slot `index & 1`; the
 * arrows (match -> the match it feeds) only draw that.
 */

export const BRACKET_SIZES = [4, 8, 16, 32, 64, 128, 256] as const;
export type BracketSize = (typeof BRACKET_SIZES)[number];

/** Top or bottom row of a match. */
export type Slot = 0 | 1;

export interface BracketIds {
  readonly node: () => NodeId;
  readonly link: () => LinkId;
  readonly player: () => PlayerId;
}

const NEW_IDS: BracketIds = { node: createNodeId, link: createLinkId, player: createPlayerId };

/** How many rounds a bracket of `size` players has (4 -> 2, 64 -> 6). */
export const roundsFor = (size: number): number => Math.round(Math.log2(size));

/**
 * The column headings, first round first: "Round 1", "Round 2" …, with the
 * last three called "Quarterfinals", "Semifinals" and "Final" (only the
 * ones that exist).
 */
export function roundNames(size: number): string[] {
  const rounds = roundsFor(size);
  const last = ["Final", "Semifinals", "Quarterfinals"];
  return Array.from({ length: rounds }, (_, i) => last[rounds - 1 - i] ?? `Round ${i + 1}`);
}

export const matchOf = (map: LinkMap, id: NodeId): Match | undefined => map.nodes[id]?.match;

/** Every match, by round and place: `grid[round - 1][index]`. */
export function matchGrid(map: LinkMap): NodeId[][] {
  const grid: NodeId[][] = [];
  for (const node of Object.values(map.nodes)) {
    if (!node.match) continue;
    (grid[node.match.round - 1] ??= [])[node.match.index] = node.id;
  }
  return grid;
}

/** How many players the bracket is for. */
export const bracketSize = (map: LinkMap): number => (matchGrid(map)[0]?.length ?? 0) * 2;

/** The match `id` feeds, and which of its slots, or `null` for the final. */
export function nextMatch(map: LinkMap, id: NodeId): { readonly id: NodeId; readonly slot: Slot } | null {
  const match = matchOf(map, id);
  if (!match) return null;
  const next = matchGrid(map)[match.round]?.[match.index >> 1];
  return next ? { id: next, slot: (match.index & 1) as Slot } : null;
}

/**
 * The earlier matches a selected match lights up: the path its players took
 * to get here, not every match that feeds it (owner's call, 2026-10-16).
 * With a winner, only the winner's path; without one, each player's path,
 * and for a still-empty slot every match that could send a player into it.
 */
export function pathTo(map: LinkMap, id: NodeId): Set<NodeId> {
  const grid = matchGrid(map);
  const out = new Set<NodeId>();
  // `player`: the one player to follow back from `at`, or `null` for both slots.
  const visit = (at: NodeId, player: PlayerId | null): void => {
    const match = matchOf(map, at);
    if (!match) return;
    match.slots.forEach((p, slot) => {
      if (player && p !== player) return;
      const feeder = grid[match.round - 2]?.[match.index * 2 + slot];
      if (!feeder) return;
      out.add(feeder);
      visit(feeder, p);
    });
  };
  visit(id, matchOf(map, id)?.winner ?? null);
  return out;
}

/** The final's winner, or `null`. */
export function champion(map: LinkMap): PlayerId | null {
  const grid = matchGrid(map);
  const final = grid[grid.length - 1]?.[0];
  return (final && matchOf(map, final)?.winner) ?? null;
}

/** A player's name ("" when not typed yet, or no such player). */
export const playerName = (map: LinkMap, id: PlayerId | null): string => (id && map.players?.[id]?.name) || "";

/** One typed slot of the first round. */
export interface FirstRoundSlot {
  readonly match: NodeId;
  readonly slot: Slot;
  readonly player: PlayerId;
}

/** The first round's slots top to bottom: the order Enter / Tab and a
    paste walk through. */
export function firstRoundSlots(map: LinkMap): FirstRoundSlot[] {
  const out: FirstRoundSlot[] = [];
  for (const id of matchGrid(map)[0] ?? []) {
    const match = matchOf(map, id);
    match?.slots.forEach((player, slot) => {
      if (player) out.push({ match: id, slot: slot as Slot, player });
    });
  }
  return out;
}

const linkOf = (id: LinkId, from: NodeId, to: NodeId): Link => ({ id, from, to, label: "" });

/** The arrows a bracket's matches call for: each match to the one it feeds. */
function bracketLinks(map: LinkMap, newLinkId: () => LinkId): Record<LinkId, Link> {
  const kept = new Map<string, LinkId>();
  for (const link of Object.values(map.links)) kept.set(`${link.from}>${link.to}`, link.id);
  const links: Record<LinkId, Link> = {};
  for (const node of Object.values(map.nodes)) {
    const next = nextMatch(map, node.id);
    if (!next) continue;
    const id = kept.get(`${node.id}>${next.id}`) ?? newLinkId();
    links[id] = linkOf(id, node.id, next.id);
  }
  return links;
}

/**
 * A new bracket for `size` players: every match of every round, the
 * first round's slots each holding a player with no name yet. `firstPlayer`
 * is the top slot of the first match, where typing starts.
 */
export function createBracket(
  id: MapId,
  name: string,
  page: Size,
  size: BracketSize,
  ids: BracketIds = NEW_IDS,
): { map: LinkMap; firstPlayer: PlayerId } {
  const nodes: Record<NodeId, MapNode> = {};
  const players: Record<PlayerId, Player> = {};
  const rounds = roundsFor(size);
  for (let round = 1; round <= rounds; round++) {
    for (let index = 0; index < size >> round; index++) {
      const slot = (): PlayerId | null => {
        if (round > 1) return null;
        const player = ids.player();
        players[player] = { id: player, name: "" };
        return player;
      };
      const match: Match = { round, index, slots: [slot(), slot()], winner: null };
      const node = ids.node();
      nodes[node] = { id: node, name: "", x: 0, y: 0, color: null, status: null, match };
    }
  }
  // Left to right, round 1 to the final: the arrows leave each match's right side.
  const blank: LinkMap = { ...createMap(id, name, page, "bracket"), direction: "LR", arrowStyle: "elbow", nodes, players };
  const map = { ...blank, links: bracketLinks(blank, ids.link) };
  return { map, firstPlayer: firstRoundSlots(map)[0].player };
}

/** Renames a player (one line, tidied). Every slot they have reached shows
    the new name, since slots hold the player, not the name. Results stay,
    even when the name is emptied (owner's call, 2026-10-16). */
export function renamePlayer(map: LinkMap, id: PlayerId, name: string): LinkMap {
  const player = map.players?.[id];
  const clean = cleanName(name);
  if (!player || player.name === clean) return map;
  return { ...map, players: { ...map.players, [id]: { ...player, name: clean } } };
}

/**
 * Pastes several lines into the first round, one name per line, starting
 * at `from`'s slot and going down. Blank lines are skipped. `filled` is how
 * many slots got a name; `ignored` how many names were left over past the
 * last slot (for the message).
 */
export function pasteNames(
  map: LinkMap,
  from: PlayerId,
  text: string,
): { map: LinkMap; filled: number; ignored: number } {
  const slots = firstRoundSlots(map);
  const start = slots.findIndex((s) => s.player === from);
  if (start < 0) return { map, filled: 0, ignored: 0 };
  const names = text.split(/\r?\n/).map(cleanName).filter(Boolean);
  const room = slots.slice(start);
  let out = map;
  names.slice(0, room.length).forEach((name, i) => (out = renamePlayer(out, room[i].player, name)));
  const filled = Math.min(names.length, room.length);
  return { map: out, filled, ignored: names.length - filled };
}

/** Whether a slot is empty: no player yet (later rounds), or a first-round
    player with no name. */
export const isEmptySlot = (map: LinkMap, player: PlayerId | null): boolean => !playerName(map, player);

/** Whether a match can have a winner: both its slots are filled. */
export function canPickWinner(map: LinkMap, id: NodeId): boolean {
  const match = matchOf(map, id);
  return !!match && !match.slots.some((p) => isEmptySlot(map, p));
}

/** What a click on a match with an empty slot says. */
export const EMPTY_SLOT_HINT = "Both players are needed before this match has a winner.";

/** A result edit: the new map, and how many later results it cleared. */
export interface ResultEdit {
  readonly map: LinkMap;
  readonly cleared: number;
}

const withMatch = (nodes: Record<NodeId, MapNode>, id: NodeId, change: Partial<Match>): void => {
  const node = nodes[id];
  nodes[id] = { ...node, match: { ...node.match!, ...change } };
};

/**
 * Sets (or with `null` clears) a match's result. The winner moves into the
 * next match's slot; if that match had a result, it no longer stands (one
 * of its players changed), so it is cleared, and so on to the final:
 * every later result on the path (owner's call, 2026-10-16). `cleared`
 * counts those later results. The same map when nothing changes; `null`
 * when refused (not one of the match's players, or a slot is empty).
 */
export function setWinner(map: LinkMap, id: NodeId, winner: PlayerId | null): ResultEdit | null {
  const match = matchOf(map, id);
  if (!match) return null;
  if (winner !== null && (!match.slots.includes(winner) || !canPickWinner(map, id))) return null;
  if (match.winner === winner) return { map, cleared: 0 };
  const nodes = { ...map.nodes };
  withMatch(nodes, id, { winner });
  const moved = { ...map, nodes };
  let cleared = 0;
  let at = id;
  let advancing = winner;
  for (let next = nextMatch(moved, at); next; next = nextMatch(moved, at)) {
    const ahead = nodes[next.id].match!;
    const slots: [PlayerId | null, PlayerId | null] = [...ahead.slots];
    slots[next.slot] = advancing;
    withMatch(nodes, next.id, { slots, winner: null });
    if (ahead.winner === null) break;
    cleared++;
    at = next.id;
    advancing = null;
  }
  return { map: moved, cleared };
}

export const clearWinner = (map: LinkMap, id: NodeId): ResultEdit | null => setWinner(map, id, null);

/**
 * A click on a player's row: marks them the winner; on the bold winner
 * again, clears the result; on the other player, switches it. `null` when
 * refused (a slot of the match is empty).
 */
export function pickWinner(map: LinkMap, id: NodeId, slot: Slot): ResultEdit | null {
  const match = matchOf(map, id);
  const player = match?.slots[slot];
  if (!match || !player || !canPickWinner(map, id)) return null;
  return setWinner(map, id, match.winner === player ? null : player);
}

/** The short message after a result edit that cleared later results. */
export const clearedText = (cleared: number): string | null =>
  cleared === 0 ? null : `Cleared ${cleared} later ${cleared === 1 ? "result" : "results"}`;

/**
 * Puts a saved bracket back in order, or `null` when its matches don't
 * form a whole bracket (a size other than 4-256, a match missing, out of
 * place or there twice): there is no telling what was meant, so the
 * caller treats it as unreadable instead of guessing.
 *
 * Repairs, each one fix, walked from the first round on so a fix flows
 * down the path: a box that isn't a match is dropped; a first-round slot
 * with no player (or one another slot already has) gets a new player with
 * no name; a later slot that disagrees with the result before it is set
 * to it; a winner that isn't one of the match's two players, or a match
 * with a slot changed above, loses its result -- and with it everything
 * after (its winner's slot ahead now disagrees). Players no slot holds
 * are dropped, and the arrows are rebuilt from the matches.
 */
export function repairBracket(map: LinkMap, ids: BracketIds = NEW_IDS): { map: LinkMap; fixes: number } | null {
  let fixes = 0;
  const nodes: Record<NodeId, MapNode> = {};
  for (const node of Object.values(map.nodes)) {
    if (node.match) nodes[node.id] = node;
    else fixes++;
  }
  const grid = matchGrid({ ...map, nodes });
  const first = grid[0]?.length ?? 0;
  if (!(BRACKET_SIZES as readonly number[]).includes(first * 2)) return null;
  const rounds = roundsFor(first * 2);
  let count = 0;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < first >> r; i++) if (!grid[r]?.[i]) return null;
    count += first >> r;
  }
  if (Object.keys(nodes).length !== count) return null;

  const players: Record<PlayerId, Player> = {};
  const saved = map.players ?? {};
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < first >> r; i++) {
      const id = grid[r][i];
      const match = nodes[id].match!;
      const slots: [PlayerId | null, PlayerId | null] = [...match.slots];
      let changed = false;
      for (const s of [0, 1] as const) {
        let want: PlayerId | null;
        if (r === 0) {
          const player = slots[s];
          want = player && saved[player] && !players[player] ? player : ids.player();
          if (want !== player) players[want] = { id: want, name: "" };
          else players[want] = saved[want];
        } else {
          want = nodes[grid[r - 1][2 * i + s]].match!.winner;
        }
        if (want !== slots[s]) {
          slots[s] = want;
          changed = true;
        }
      }
      const winnerOk =
        match.winner === null || (!changed && slots.includes(match.winner) && !slots.includes(null));
      if (changed || !winnerOk) fixes++;
      if (changed || !winnerOk) nodes[id] = { ...nodes[id], match: { ...match, slots, winner: winnerOk ? match.winner : null } };
    }
  }
  if (Object.keys(saved).length !== Object.keys(players).length) fixes++;
  const repaired = { ...map, nodes, players };
  const links = bracketLinks(repaired, ids.link);
  const sameLinks =
    Object.keys(links).length === Object.keys(map.links).length &&
    Object.values(links).every((l) => map.links[l.id]?.from === l.from && map.links[l.id]?.to === l.to);
  if (!sameLinks) fixes++;
  return fixes === 0 ? { map, fixes } : { map: { ...repaired, links }, fixes };
}

/** One player row of one match: where keyboard focus sits in a bracket. */
export interface RowSpot {
  readonly match: NodeId;
  readonly slot: Slot;
}

/** The keys that move between player rows: Enter is the same as the down arrow. */
export type RowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Enter";

/**
 * Where a key goes from a player row: down (the down arrow or Enter) and up
 * through the column (a match's two rows, then the match below or above),
 * right to the match this one's winner moves on to, left back to the match
 * feeding this row. Left and right always land on that match's top row
 * (the owner's rule), so the next press of down reaches the bottom one.
 * `null` at an edge.
 */
export function rowAfterKey(map: LinkMap, from: RowSpot, key: RowKey): RowSpot | null {
  const match = matchOf(map, from.match);
  if (!match) return null;
  const column = matchGrid(map)[match.round - 1];
  if (key === "ArrowUp" || key === "ArrowDown" || key === "Enter") {
    const step = key === "ArrowUp" ? -1 : 1;
    const place = match.index * 2 + from.slot + step;
    const id = column[place >> 1];
    return place >= 0 && id ? { match: id, slot: (place & 1) as Slot } : null;
  }
  if (key === "ArrowRight") {
    const next = nextMatch(map, from.match);
    return next ? { match: next.id, slot: 0 } : null;
  }
  const feeder = matchGrid(map)[match.round - 2]?.[match.index * 2 + from.slot];
  return feeder ? { match: feeder, slot: 0 } : null;
}

/** Where the row keys start when no row has keyboard focus yet (after
    typing a name, or a click on the page): the top row of `selected` if it
    is a match, else the bracket's first slot. */
export function startRow(map: LinkMap, selected: NodeId | null): RowSpot | null {
  if (selected && matchOf(map, selected)) return { match: selected, slot: 0 };
  const first = matchGrid(map)[0]?.[0];
  return first ? { match: first, slot: 0 } : null;
}

/** A match in words, for the status line: "Ann v Bob" ("—" for an empty
    slot). A bracket's boxes have no names of their own. */
export function matchTitle(map: LinkMap, id: NodeId): string {
  const match = matchOf(map, id);
  return match ? match.slots.map((p) => playerName(map, p) || "—").join(" v ") : "";
}
