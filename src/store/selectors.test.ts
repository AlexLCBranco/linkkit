import { describe, expect, it } from "vitest";

import { createBracket, matchGrid, pasteNames, pickWinner } from "../domain/bracket";
import { asLinkId, asMapId, asNodeId, asPlayerId } from "../domain/ids";
import { build } from "../domain/testMaps";
import { selectFocus, selectLinkHighlight, selectNodeHighlight, selectReach } from "./selectors";

// a needs b, b needs c; d needs a; e stands alone.
const map = build(["a", "b", "c", "d", "e"], [["a", "b"], ["b", "c"], ["d", "a"]]);
const id = asNodeId;

describe("highlight selectors", () => {
  it("highlights nothing while nothing is selected", () => {
    const s = { map, selected: null };
    expect(selectReach(s)).toBeNull();
    expect(selectNodeHighlight(s, id("a"))).toBeNull();
    expect(selectLinkHighlight(s, asLinkId("a>b"))).toBeNull();
  });

  it("gives each box and arrow its own highlight", () => {
    const s = { map, selected: id("b") };
    expect(selectNodeHighlight(s, id("b"))).toBe("selected");
    expect(selectNodeHighlight(s, id("c"))).toBe("teal");
    expect(selectNodeHighlight(s, id("a"))).toBe("orange");
    expect(selectNodeHighlight(s, id("d"))).toBe("orange");
    expect(selectNodeHighlight(s, id("e"))).toBe("faded");
    expect(selectLinkHighlight(s, asLinkId("b>c"))).toBe("teal");
    expect(selectLinkHighlight(s, asLinkId("d>a"))).toBe("orange");
  });

  it("works the reach out once per map and selection", () => {
    const s = { map, selected: id("a") };
    const first = selectReach(s);
    expect(selectReach({ map, selected: id("a") })).toBe(first);
    expect(selectReach({ map, selected: id("b") })).not.toBe(first);
  });

  it("ignores hovering outside a bracket", () => {
    const s = { map, selected: id("b"), hovered: id("d") };
    expect(selectFocus(s)).toBe(id("b"));
    expect(selectNodeHighlight(s, id("c"))).toBe("teal");
  });

  it("highlights nothing when the selected box no longer exists", () => {
    const s = { map, selected: id("gone") };
    expect(selectReach(s)).toBeNull();
    expect(selectNodeHighlight(s, id("a"))).toBeNull();
  });
});

describe("a bracket's hovered match", () => {
  // 8 players, the top player wins every match: A is champion.
  function played() {
    const counter = { n: 0, l: 0, p: 0 };
    const ids = {
      node: () => asNodeId(`n${++counter.n}`),
      link: () => asLinkId(`l${++counter.l}`),
      player: () => asPlayerId(`p${++counter.p}`),
    };
    const created = createBracket(asMapId("m"), "Cup", { width: 800, height: 600 }, 8, ids);
    let bracket = pasteNames(created.map, created.firstPlayer, "A\nB\nC\nD\nE\nF\nG\nH").map;
    const grid = matchGrid(bracket);
    for (const round of grid) for (const match of round) bracket = pickWinner(bracket, match, 0)!.map;
    return { bracket, grid: matchGrid(bracket) };
  }

  it("lights the hovered match's path, keeping the selected one's ring", () => {
    const { bracket, grid } = played();
    const final = grid[2][0];
    const lowerSemi = grid[1][1];
    const s = { map: bracket, selected: final, hovered: lowerSemi };
    expect(selectFocus(s)).toBe(lowerSemi);
    // The lower semi's winner (E) came from the third first-round match.
    expect(selectNodeHighlight(s, grid[0][2])).toBe("teal");
    expect(selectNodeHighlight(s, lowerSemi)).toBe("teal");
    expect(selectNodeHighlight(s, grid[0][0])).toBe("plain");
    expect(selectNodeHighlight(s, final)).toBe("selected");
    // Mouse gone: back to the selected match's path.
    const after = { ...s, hovered: null };
    expect(selectFocus(after)).toBe(final);
    expect(selectNodeHighlight(after, grid[0][0])).toBe("teal");
    expect(selectNodeHighlight(after, grid[0][2])).toBe("plain");
  });

  it("lights a hovered match's path with nothing selected", () => {
    const { bracket, grid } = played();
    const s = { map: bracket, selected: null, hovered: grid[1][0] };
    expect(selectNodeHighlight(s, grid[0][0])).toBe("teal");
    expect(selectNodeHighlight(s, grid[0][1])).toBe("plain");
    expect(selectNodeHighlight(s, grid[1][0])).toBe("teal");
  });

  it("lights the past paths of every match the marquee picked, each with its ring", () => {
    const { bracket, grid } = played();
    const s = { map: bracket, selected: null, group: [grid[1][0], grid[1][1]] };
    expect(selectNodeHighlight(s, grid[1][0])).toBe("selected");
    expect(selectNodeHighlight(s, grid[1][1])).toBe("selected");
    expect(selectNodeHighlight(s, grid[0][0])).toBe("teal"); // A, into the upper semi
    expect(selectNodeHighlight(s, grid[0][2])).toBe("teal"); // E, into the lower semi
    expect(selectNodeHighlight(s, grid[0][1])).toBe("plain");
    expect(selectNodeHighlight(s, grid[2][0])).toBe("plain"); // nothing ahead
    // Hovering another match shows its path; the picked ones keep their rings.
    const hovering = { ...s, hovered: grid[0][3] };
    expect(selectNodeHighlight(hovering, grid[1][0])).toBe("selected");
    expect(selectNodeHighlight(hovering, grid[0][0])).toBe("plain");
  });

  it("lights no paths for a group outside a bracket", () => {
    expect(selectNodeHighlight({ map, selected: null, group: [id("a"), id("b")] }, id("c"))).toBeNull();
  });

  it("forgets a hovered match that no longer exists", () => {
    const { bracket, grid } = played();
    expect(selectFocus({ map: bracket, selected: grid[2][0], hovered: asNodeId("gone") })).toBe(grid[2][0]);
  });
});
