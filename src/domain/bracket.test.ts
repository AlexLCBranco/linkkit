import { describe, expect, it } from "vitest";

import {
  BRACKET_SIZES,
  bracketSize,
  canPickWinner,
  champion,
  clearWinner,
  clearedText,
  createBracket,
  firstRoundSlots,
  matchGrid,
  matchOf,
  nextMatch,
  pasteNames,
  pickWinner,
  playerName,
  renamePlayer,
  repairBracket,
  roundNames,
  rowAfterKey,
  startRow,
  matchTitle,
  pathTo,
  setWinner,
  type BracketIds,
  type BracketSize,
  type Slot,
} from "./bracket";
import { asLinkId, asMapId, asNodeId, asPlayerId } from "./ids";
import { mergeMaps } from "./merge";
import { linkHighlight, nodeHighlight, REACH_MEANINGS, reachOf } from "./reach";
import { readMap, serializeMap } from "./persistence";
import { shownMap } from "./shown";
import {
  canAddNextStep,
  canDeleteBox,
  canDeleteLink,
  canLink,
  canMove,
  canPaste,
  canSetStatus,
  linkDeleteRefusal,
  boxDeleteRefusal,
  BRACKET_FIXED,
} from "./rules";
import type { LinkId, LinkMap, Match, NodeId } from "./types";

const page = { width: 800, height: 600 };

/** Ids handed out in order: n1 …, l1 …, p1 … */
function counters(): BracketIds {
  let n = 0;
  let l = 0;
  let p = 0;
  return { node: () => asNodeId(`n${++n}`), link: () => asLinkId(`l${++l}`), player: () => asPlayerId(`p${++p}`) };
}

const NAMES = ["Ann", "Bob", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal"];

/** An 8-player bracket with NAMES typed in, top to bottom. */
function eight(): LinkMap {
  const { map, firstPlayer } = createBracket(asMapId("m"), "Cup", page, 8, counters());
  return pasteNames(map, firstPlayer, NAMES.join("\n")).map;
}

const at = (map: LinkMap, round: number, index: number): NodeId => matchGrid(map)[round - 1][index];
const m = (map: LinkMap, round: number, index: number): Match => matchOf(map, at(map, round, index))!;
const names = (map: LinkMap, round: number, index: number): string[] =>
  m(map, round, index).slots.map((p) => playerName(map, p));
const winnerName = (map: LinkMap, round: number, index: number): string => playerName(map, m(map, round, index).winner);

/** Picks the winner of (round, index) by slot; fails the test if refused. */
function win(map: LinkMap, round: number, index: number, slot: Slot): LinkMap {
  const edit = pickWinner(map, at(map, round, index), slot);
  expect(edit).not.toBeNull();
  return edit!.map;
}

/** Top player wins every match: Ann champion. */
function playedOut(): LinkMap {
  let map = eight();
  for (let round = 1; round <= 3; round++) for (let i = 0; i < 8 >> round; i++) map = win(map, round, i, 0);
  return map;
}

const roundTrip = (map: LinkMap) => readMap(JSON.parse(JSON.stringify(serializeMap(map))), page);

describe("createBracket", () => {
  it.each(BRACKET_SIZES)("makes every match of a %i-player bracket", (size) => {
    const { map, firstPlayer } = createBracket(asMapId("m"), "Cup", page, size as BracketSize, counters());
    expect(map.kind).toBe("bracket");
    // Round 1 to the final, left to right: arrows leave a match's right side.
    expect(map.direction).toBe("LR");
    const grid = matchGrid(map);
    expect(grid.map((r) => r.length)).toEqual(Array.from({ length: Math.log2(size) }, (_, i) => size >> (i + 1)));
    expect(Object.keys(map.nodes)).toHaveLength(size - 1);
    expect(bracketSize(map)).toBe(size);
    // The first round has a player in every slot, each its own, unnamed.
    const slots = firstRoundSlots(map);
    expect(slots).toHaveLength(size);
    expect(new Set(slots.map((s) => s.player)).size).toBe(size);
    expect(Object.values(map.players!).every((p) => p.name === "")).toBe(true);
    expect(firstPlayer).toBe(slots[0].player);
    expect(slots[0]).toMatchObject({ match: grid[0][0], slot: 0 });
    // Later rounds start empty, and nothing is played.
    for (const round of grid.slice(1)) for (const id of round) expect(matchOf(map, id)!.slots).toEqual([null, null]);
    expect(Object.values(map.nodes).every((n) => n.match!.winner === null)).toBe(true);
    // One arrow from each match but the final to the match it feeds.
    expect(Object.keys(map.links)).toHaveLength(size - 2);
    for (const link of Object.values(map.links)) expect(nextMatch(map, link.from)?.id).toBe(link.to);
  });

  it("feeds matches 2k and 2k+1 into match k, top and bottom", () => {
    const map = eight();
    expect(nextMatch(map, at(map, 1, 2))).toEqual({ id: at(map, 2, 1), slot: 0 });
    expect(nextMatch(map, at(map, 1, 3))).toEqual({ id: at(map, 2, 1), slot: 1 });
    expect(nextMatch(map, at(map, 3, 0))).toBeNull();
  });
});

describe("roundNames", () => {
  it("names the last five rounds, the rest by number", () => {
    expect(roundNames(4)).toEqual(["Semifinals", "Final"]);
    expect(roundNames(8)).toEqual(["Quarterfinals", "Semifinals", "Final"]);
    expect(roundNames(16)).toEqual(["Round of 16", "Quarterfinals", "Semifinals", "Final"]);
    expect(roundNames(32)).toEqual(["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"]);
    expect(roundNames(64)).toEqual([
      "Round 1", "Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final",
    ]);
    expect(roundNames(256)).toEqual([
      "Round 1", "Round 2", "Round 3", "Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final",
    ]);
  });
});

describe("names", () => {
  it("only the first round's slots are typed, top to bottom", () => {
    const map = eight();
    expect(firstRoundSlots(map).map((s) => playerName(map, s.player))).toEqual(NAMES);
    expect(firstRoundSlots(map).every((s) => matchOf(map, s.match)!.round === 1)).toBe(true);
  });

  it("a player is stored once: renaming shows everywhere they reached", () => {
    let map = playedOut();
    const ann = m(map, 1, 0).slots[0]!;
    map = renamePlayer(map, ann, "  Annie   Lee ");
    expect(names(map, 1, 0)[0]).toBe("Annie Lee");
    expect(names(map, 3, 0)[0]).toBe("Annie Lee");
    expect(playerName(map, champion(map))).toBe("Annie Lee");
    // Later slots hold the player's id, never a copy of the name.
    expect(m(map, 3, 0).slots[0]).toBe(ann);
    expect(JSON.stringify(Object.values(map.nodes))).not.toContain("Annie");
  });

  it("renaming to the same name returns the same map", () => {
    const map = eight();
    expect(renamePlayer(map, m(map, 1, 0).slots[0]!, "Ann")).toBe(map);
  });

  it("emptying a name keeps that player's results (owner's call)", () => {
    let map = playedOut();
    map = renamePlayer(map, m(map, 1, 0).slots[0]!, "");
    expect(champion(map)).toBe(m(map, 1, 0).slots[0]);
    expect(names(map, 3, 0)[0]).toBe("");
  });
});

describe("pasteNames", () => {
  it("fills the slot and the ones below, one name per line", () => {
    const { map, firstPlayer } = createBracket(asMapId("m"), "Cup", page, 4, counters());
    const pasted = pasteNames(map, firstPlayer, "Ann\nBob\r\nCat\nDan\n");
    expect(firstRoundSlots(pasted.map).map((s) => playerName(pasted.map, s.player))).toEqual(["Ann", "Bob", "Cat", "Dan"]);
    expect(pasted).toMatchObject({ filled: 4, ignored: 0 });
  });

  it("starts at the slot pasted into and counts the lines past the last slot", () => {
    const { map } = createBracket(asMapId("m"), "Cup", page, 4, counters());
    const third = firstRoundSlots(map)[2].player;
    const pasted = pasteNames(map, third, "Cat\nDan\nEve\nFay\nGus");
    expect(firstRoundSlots(pasted.map).map((s) => playerName(pasted.map, s.player))).toEqual(["", "", "Cat", "Dan"]);
    expect(pasted).toMatchObject({ filled: 2, ignored: 3 });
  });

  it("skips blank lines", () => {
    const { map, firstPlayer } = createBracket(asMapId("m"), "Cup", page, 4, counters());
    const pasted = pasteNames(map, firstPlayer, "Ann\n\n   \nBob");
    expect(firstRoundSlots(pasted.map).map((s) => playerName(pasted.map, s.player))).toEqual(["Ann", "Bob", "", ""]);
    expect(pasted.filled).toBe(2);
  });

  it("does nothing from a player who isn't in the first round", () => {
    const map = eight();
    expect(pasteNames(map, asPlayerId("nobody"), "X").map).toBe(map);
  });
});

describe("winners", () => {
  it("clicking a player marks them the winner and fills the next match's slot", () => {
    let map = eight();
    map = win(map, 1, 1, 1); // Dan beats Cat, into the semifinal's bottom slot
    expect(winnerName(map, 1, 1)).toBe("Dan");
    expect(names(map, 2, 0)).toEqual(["", "Dan"]);
    map = win(map, 1, 0, 0);
    expect(names(map, 2, 0)).toEqual(["Ann", "Dan"]);
  });

  it("clicking the winner again clears it; the other player switches it", () => {
    let map = win(eight(), 1, 0, 0);
    map = win(map, 1, 0, 1);
    expect(winnerName(map, 1, 0)).toBe("Bob");
    expect(names(map, 2, 0)[0]).toBe("Bob");
    map = win(map, 1, 0, 1);
    expect(m(map, 1, 0).winner).toBeNull();
    expect(m(map, 2, 0).slots[0]).toBeNull();
  });

  it("no winner while either slot of the match is empty", () => {
    const { map } = createBracket(asMapId("m"), "Cup", page, 4, counters());
    const typed = renamePlayer(map, m(map, 1, 0).slots[0]!, "Ann");
    expect(canPickWinner(typed, at(typed, 1, 0))).toBe(false);
    expect(pickWinner(typed, at(typed, 1, 0), 0)).toBeNull();
    // A later match with one slot filled.
    const played = win(eight(), 1, 0, 0);
    expect(canPickWinner(played, at(played, 2, 0))).toBe(false);
    expect(pickWinner(played, at(played, 2, 0), 0)).toBeNull();
  });

  it("a winner must be one of the match's two players", () => {
    const map = eight();
    expect(setWinner(map, at(map, 1, 0), m(map, 1, 1).slots[0])).toBeNull();
  });

  it("plays out to a champion", () => {
    const map = playedOut();
    expect(playerName(map, champion(map))).toBe("Ann");
    expect(names(map, 3, 0)).toEqual(["Ann", "Eve"]);
  });

  it("changing a result clears every later result on its path", () => {
    let map = playedOut();
    const edit = pickWinner(map, at(map, 1, 0), 1)!; // Bob beats Ann after all
    map = edit.map;
    expect(edit.cleared).toBe(2);
    expect(clearedText(edit.cleared)).toBe("Cleared 2 later results");
    expect(winnerName(map, 1, 0)).toBe("Bob");
    expect(names(map, 2, 0)).toEqual(["Bob", "Cat"]);
    expect(m(map, 2, 0).winner).toBeNull();
    expect(names(map, 3, 0)).toEqual(["", "Eve"]);
    expect(champion(map)).toBeNull();
    // The other half stands.
    expect(winnerName(map, 2, 1)).toBe("Eve");
    expect(winnerName(map, 1, 3)).toBe("Gus");
  });

  it("clears a later result the old winner lost too (owner's example)", () => {
    // A (Ann) beat B (Bob), then C (Cat) beat Ann; switching to Bob clears Cat's win.
    let map = win(win(eight(), 1, 0, 0), 1, 1, 0);
    map = win(map, 2, 0, 1);
    expect(winnerName(map, 2, 0)).toBe("Cat");
    const edit = pickWinner(map, at(map, 1, 0), 1)!;
    expect(edit.cleared).toBe(1);
    expect(m(edit.map, 2, 0).winner).toBeNull();
    expect(names(edit.map, 2, 0)).toEqual(["Bob", "Cat"]);
    expect(m(edit.map, 3, 0).slots[0]).toBeNull();
  });

  it("clearing a result clears what stood on it, and says nothing when nothing did", () => {
    let map = playedOut();
    const edit = clearWinner(map, at(map, 1, 3))!;
    // Gus's win goes; so do Eve's semifinal (Gus was in it) and the final (Eve was).
    expect(edit.cleared).toBe(2);
    map = edit.map;
    expect(m(map, 2, 1).winner).toBeNull();
    expect(names(map, 2, 1)).toEqual(["Eve", ""]);
    expect(names(map, 3, 0)).toEqual(["Ann", ""]);
    const one = win(eight(), 1, 0, 0);
    const fresh = clearWinner(one, at(one, 1, 0))!;
    expect(fresh.cleared).toBe(0);
    expect(clearedText(0)).toBeNull();
    expect(clearedText(1)).toBe("Cleared 1 later result");
  });

  it("setting the same result returns the same map", () => {
    const map = win(eight(), 1, 0, 0);
    const edit = setWinner(map, at(map, 1, 0), m(map, 1, 0).winner);
    expect(edit).toEqual({ map, cleared: 0 });
  });
});

describe("bracket rules", () => {
  const map = eight();
  const [a, b] = [at(map, 1, 0), at(map, 2, 1)];
  const link = Object.keys(map.links)[0] as LinkId;

  it("the structure is fixed: no arrows drawn, nothing deleted, moved, pasted or added", () => {
    expect(canLink(map, a, b)).toEqual({ ok: false, reason: "bracket" });
    expect(canDeleteBox(map, a)).toBe(false);
    expect(canDeleteLink(map, link)).toBe(false);
    expect(canMove(map, a, b)).toEqual({ ok: false, reason: "bracket" });
    expect(canPaste(map)).toBe(false);
    expect(canAddNextStep(map, a)).toBe(false);
    expect(canSetStatus(map, a)).toBe(false);
  });

  it("says why", () => {
    expect(boxDeleteRefusal(map, a)).toBe(BRACKET_FIXED);
    expect(linkDeleteRefusal(map, link)).toBe(BRACKET_FIXED);
  });
});

describe("save and load", () => {
  it("reads back exactly", () => {
    const map = win(playedOut(), 1, 0, 1);
    expect(roundTrip(map)).toEqual({ status: "ok", map });
  });

  /** A played-out bracket with one match changed by hand, read back. */
  function damaged(round: number, index: number, change: (match: Match) => Partial<Match>) {
    const map = playedOut();
    const id = at(map, round, index);
    const node = map.nodes[id];
    const bad = { ...map, nodes: { ...map.nodes, [id]: { ...node, match: { ...node.match!, ...change(node.match!) } } } };
    return roundTrip(bad);
  }

  it("a winner who isn't one of the match's players: that result and everything after are cleared", () => {
    const read = damaged(2, 0, () => ({ winner: asPlayerId("p5") })); // Eve, who isn't in it
    expect(read.status).toBe("repaired");
    if (read.status !== "repaired") return;
    expect(m(read.map, 2, 0).winner).toBeNull();
    expect(m(read.map, 3, 0).slots[0]).toBeNull();
    expect(m(read.map, 3, 0).winner).toBeNull();
    expect(winnerName(read.map, 2, 1)).toBe("Eve");
    expect(winnerName(read.map, 1, 0)).toBe("Ann");
  });

  it("a slot pointing to a missing player: cleared with everything after", () => {
    const read = damaged(2, 1, (match) => ({ slots: [asPlayerId("ghost"), match.slots[1]] }));
    expect(read.status).toBe("repaired");
    if (read.status !== "repaired") return;
    // The slot is what the result before it says; its result and the final's are gone.
    expect(names(read.map, 2, 1)).toEqual(["Eve", "Gus"]);
    expect(m(read.map, 2, 1).winner).toBeNull();
    expect(champion(read.map)).toBeNull();
    expect(read.map.players![asPlayerId("ghost")]).toBeUndefined();
  });

  it("a first-round slot pointing to a missing player gets an empty one, and its results go", () => {
    const map = playedOut();
    const ann = m(map, 1, 0).slots[0]!;
    const { [ann]: _, ...players } = map.players!;
    const read = roundTrip({ ...map, players });
    expect(read.status).toBe("repaired");
    if (read.status !== "repaired") return;
    const slot = m(read.map, 1, 0).slots[0];
    expect(slot).not.toBe(ann);
    expect(read.map.players![slot!]).toEqual({ id: slot, name: "" });
    expect(m(read.map, 1, 0).winner).toBeNull();
    expect(champion(read.map)).toBeNull();
    expect(winnerName(read.map, 2, 1)).toBe("Eve");
  });

  it("a later slot that disagrees with the result before it: set right, later results cleared", () => {
    const read = damaged(3, 0, () => ({ slots: [asPlayerId("p3"), asPlayerId("p5")] })); // Cat, who lost
    expect(read.status).toBe("repaired");
    if (read.status !== "repaired") return;
    expect(names(read.map, 3, 0)).toEqual(["Ann", "Eve"]);
    expect(champion(read.map)).toBeNull();
  });

  it("rebuilds missing arrows", () => {
    const map = playedOut();
    const read = roundTrip({ ...map, links: {} });
    expect(read.status).toBe("repaired");
    if (read.status !== "repaired") return;
    expect(Object.keys(read.map.links)).toHaveLength(6);
    expect(champion(read.map)).toBe(champion(map));
  });

  it("matches that don't form a whole bracket are unreadable, not guessed at", () => {
    const map = playedOut();
    const { [at(map, 2, 1)]: _, ...nodes } = map.nodes;
    expect(roundTrip({ ...map, nodes }).status).toBe("unreadable");
    const twice = { ...map.nodes[at(map, 1, 0)], id: asNodeId("extra") };
    expect(roundTrip({ ...map, nodes: { ...map.nodes, [twice.id]: twice } }).status).toBe("unreadable");
    const node = map.nodes[at(map, 1, 0)];
    const broken = { ...map, nodes: { ...map.nodes, [node.id]: { ...node, match: { round: "one" } } } };
    expect(roundTrip(broken as unknown as LinkMap).status).toBe("unreadable");
  });

  it("drops a match on a box of another kind of map", () => {
    const { map } = createBracket(asMapId("m"), "Cup", page, 4, counters());
    const read = roundTrip({ ...map, kind: "connections", players: undefined, links: {} });
    expect(read.status).toBe("repaired");
    if (read.status !== "repaired") return;
    expect(Object.values(read.map.nodes).every((n) => n.match === undefined)).toBe(true);
  });

  it.each([128, 256])("offers %i players, and reads that bracket back", (size) => {
    expect(BRACKET_SIZES).toContain(size);
    const { map } = createBracket(asMapId("m"), "Cup", page, size as BracketSize, counters());
    expect(roundTrip(map)).toEqual({ status: "ok", map });
  });

  it("repairBracket leaves a whole bracket alone", () => {
    const map = playedOut();
    expect(repairBracket(map)).toEqual({ map, fixes: 0 });
  });
});

describe("two tabs", () => {
  it("a result changed under a winner moved on in another tab: put back in order", () => {
    const base = win(win(eight(), 1, 0, 0), 1, 1, 0);
    const mine = win(base, 2, 0, 0); // Ann wins the semifinal here
    const theirs = win(base, 1, 0, 1); // Bob beat Ann there
    const merged = mergeMaps(base, mine, theirs).map;
    expect(repairBracket(merged)).toEqual({ map: merged, fixes: 0 });
    expect(names(merged, 2, 0)).toEqual(["Bob", "Cat"]);
    expect(m(merged, 2, 0).winner).toBeNull();
  });
});

describe("row keys with the first rounds hidden", () => {
  it("start on the first match shown, and left stops at the first round shown", () => {
    const map = shownMap(eight(), 1);
    expect(startRow(map, null)).toEqual({ match: at(eight(), 2, 0), slot: 0 });
    // A selected match that is hidden: the first match shown instead.
    expect(startRow(map, at(eight(), 1, 2))).toEqual({ match: at(eight(), 2, 0), slot: 0 });
    expect(rowAfterKey(map, { match: at(eight(), 2, 1), slot: 1 }, "ArrowLeft")).toBeNull();
    expect(rowAfterKey(map, { match: at(eight(), 2, 0), slot: 1 }, "ArrowDown")).toEqual({ match: at(eight(), 2, 1), slot: 0 });
  });
});

describe("rowAfterKey", () => {
  it("goes down a match's rows, then on to the next match, and stops at the bottom", () => {
    const map = eight();
    expect(rowAfterKey(map, { match: at(map, 1, 0), slot: 0 }, "ArrowDown")).toEqual({ match: at(map, 1, 0), slot: 1 });
    expect(rowAfterKey(map, { match: at(map, 1, 0), slot: 1 }, "ArrowDown")).toEqual({ match: at(map, 1, 1), slot: 0 });
    expect(rowAfterKey(map, { match: at(map, 1, 3), slot: 1 }, "ArrowDown")).toBeNull();
    expect(rowAfterKey(map, { match: at(map, 2, 1), slot: 0 }, "ArrowUp")).toEqual({ match: at(map, 2, 0), slot: 1 });
    expect(rowAfterKey(map, { match: at(map, 1, 0), slot: 0 }, "ArrowUp")).toBeNull();
  });

  it("Enter goes down like the down arrow", () => {
    const map = eight();
    expect(rowAfterKey(map, { match: at(map, 1, 0), slot: 0 }, "Enter")).toEqual({ match: at(map, 1, 0), slot: 1 });
    expect(rowAfterKey(map, { match: at(map, 1, 0), slot: 1 }, "Enter")).toEqual({ match: at(map, 1, 1), slot: 0 });
    expect(rowAfterKey(map, { match: at(map, 1, 3), slot: 1 }, "Enter")).toBeNull();
  });

  it("goes right to the match this one feeds, and left to the match feeding a row: always onto its top row", () => {
    let map = eight();
    // Match 3 feeds the bottom row of semifinal 1; right still lands on its top row.
    expect(rowAfterKey(map, { match: at(map, 1, 3), slot: 0 }, "ArrowRight")).toEqual({ match: at(map, 2, 1), slot: 0 });
    expect(rowAfterKey(map, { match: at(map, 1, 3), slot: 1 }, "ArrowRight")).toEqual({ match: at(map, 2, 1), slot: 0 });
    expect(rowAfterKey(map, { match: at(map, 3, 0), slot: 0 }, "ArrowRight")).toBeNull();
    expect(rowAfterKey(map, { match: at(map, 2, 1), slot: 1 }, "ArrowLeft")).toEqual({ match: at(map, 1, 3), slot: 0 });
    // Played, the winner on the bottom row: still the top row.
    map = win(map, 1, 3, 1);
    expect(rowAfterKey(map, { match: at(map, 2, 1), slot: 1 }, "ArrowLeft")).toEqual({ match: at(map, 1, 3), slot: 0 });
    expect(rowAfterKey(map, { match: at(map, 1, 0), slot: 1 }, "ArrowLeft")).toBeNull();
  });
});

describe("startRow", () => {
  it("starts on the selected match's top row, else the first slot", () => {
    const map = eight();
    expect(startRow(map, at(map, 2, 1))).toEqual({ match: at(map, 2, 1), slot: 0 });
    expect(startRow(map, null)).toEqual({ match: at(map, 1, 0), slot: 0 });
  });
});

describe("matchTitle", () => {
  it("names a match by its players, a dash for an empty slot", () => {
    const map = win(eight(), 1, 0, 0);
    expect(matchTitle(map, at(map, 1, 0))).toBe("Ann v Bob");
    expect(matchTitle(map, at(map, 2, 0))).toBe("Ann v —");
    expect(matchTitle(map, asNodeId("nope"))).toBe("");
  });
});

describe("pathTo (the highlight back from a selected match)", () => {
  const ids = (map: LinkMap, ...spots: [number, number][]) => new Set(spots.map(([r, i]) => at(map, r, i)));

  it("lights only the winner's path, not every match feeding it", () => {
    const map = playedOut(); // Ann won R1 #0, the semi #0 and the final
    expect(pathTo(map, at(map, 3, 0))).toEqual(ids(map, [1, 0], [2, 0]));
    const reach = reachOf(map, at(map, 3, 0))!;
    expect(reach.teal).toEqual(ids(map, [1, 0], [2, 0]));
    const link = (from: NodeId) => Object.values(map.links).find((l) => l.from === from)!;
    expect(linkHighlight(reach, link(at(map, 1, 0)))).toBe("teal");
    expect(linkHighlight(reach, link(at(map, 2, 0)))).toBe("teal");
    // Off the path, matches and arrows look as usual: a bracket fades nothing.
    expect(linkHighlight(reach, link(at(map, 1, 1)))).toBe("plain");
    expect(linkHighlight(reach, link(at(map, 2, 1)))).toBe("plain");
    expect(nodeHighlight(reach, at(map, 1, 1))).toBe("plain");
    expect(nodeHighlight(reach, at(map, 2, 1))).toBe("plain");
  });

  it("lights nothing ahead: only the past path", () => {
    const map = playedOut();
    const reach = reachOf(map, at(map, 2, 0))!; // semi #0, Ann went on to win the final
    expect(reach.orange.size).toBe(0);
    expect(nodeHighlight(reach, at(map, 3, 0))).toBe("plain");
    const ahead = Object.values(map.links).find((l) => l.from === at(map, 2, 0))!;
    expect(linkHighlight(reach, ahead)).toBe("plain");
    expect(REACH_MEANINGS.bracket.orangeWords).toBeNull();
  });

  it("without a winner, lights both players' paths", () => {
    let map = eight();
    for (let i = 0; i < 4; i++) map = win(map, 1, i, 0);
    map = win(win(map, 2, 0, 0), 2, 1, 1); // Ann v Gus in the final, undecided
    expect(pathTo(map, at(map, 3, 0))).toEqual(ids(map, [1, 0], [2, 0], [1, 3], [2, 1]));
  });

  it("from one row, lights only that player's path", () => {
    let map = eight();
    for (let i = 0; i < 4; i++) map = win(map, 1, i, 0);
    map = win(win(map, 2, 0, 0), 2, 1, 1); // Ann v Gus in the final, undecided
    expect(pathTo(map, at(map, 3, 0), 0)).toEqual(ids(map, [1, 0], [2, 0]));
    expect(pathTo(map, at(map, 3, 0), 1)).toEqual(ids(map, [1, 3], [2, 1]));
    // Even the loser's row shows the loser's path, not the winner's.
    const decided = win(map, 3, 0, 0);
    expect(pathTo(decided, at(decided, 3, 0), 1)).toEqual(ids(map, [1, 3], [2, 1]));
    // An empty row: every match that could fill it.
    const half = win(eight(), 1, 0, 0); // semi #0: Ann v (empty)
    expect(pathTo(half, at(half, 2, 0), 1)).toEqual(ids(half, [1, 1]));
    expect(reachOf(map, at(map, 3, 0), 1)!.teal).toEqual(ids(map, [1, 3], [2, 1]));
  });

  it("several picked matches light all their past paths at once", () => {
    const map = playedOut();
    const semis = [at(map, 2, 0), at(map, 2, 1)];
    const reach = reachOf(map, semis)!;
    expect(reach.teal).toEqual(new Set([...pathTo(map, semis[0]), ...pathTo(map, semis[1])]));
    for (const semi of semis) expect(nodeHighlight(reach, semi)).toBe("selected");
    expect(nodeHighlight(reach, at(map, 3, 0))).toBe("plain"); // nothing ahead
    // The arrows into each picked semi, from its path, light up too.
    for (const semi of semis) {
      const into = Object.values(map.links).find((l) => l.to === semi && reach.teal.has(l.from))!;
      expect(linkHighlight(reach, into)).toBe("teal");
    }
  });

  it("an empty slot lights every match that could fill it", () => {
    const fresh = createBracket(asMapId("m"), "Cup", page, 8, counters()).map;
    expect(pathTo(fresh, at(fresh, 3, 0)).size).toBe(6);
    const map = win(eight(), 1, 0, 0); // semi #0: Ann v (empty)
    expect(pathTo(map, at(map, 2, 0))).toEqual(ids(map, [1, 0], [1, 1]));
    expect(pathTo(map, at(map, 1, 0)).size).toBe(0);
  });
});
