import { describe, expect, it } from "vitest";

import { BRACKET_SIZES, createBracket, matchGrid, roundNames, setWinner, firstRoundSlots, renamePlayer } from "./bracket";
import { bracketDecor, layoutBracket, pinnedRounds } from "./bracketLayout";
import type { Box } from "./geometry";
import { asMapId } from "./ids";
import { layoutMap, type MapLayout } from "./layout";
import { shownMap } from "./shown";
import type { NodeId, Size } from "./types";

const options = { columnGap: 32, rowGap: 60, fallbackSize: { width: 160, height: 64 } };
const PAGE = { width: 800, height: 600 };
const bracket = (size: (typeof BRACKET_SIZES)[number]) => createBracket(asMapId("b"), "Cup", PAGE, size).map;

/** Every match's box, as laid out (fallback sizes unless given). */
function boxesOf(layout: MapLayout, sizes = new Map<NodeId, Size>()): Map<NodeId, Box> {
  return new Map(
    [...layout.positions].map(([id, center]) => [id, { center, size: sizes.get(id) ?? options.fallbackSize }]),
  );
}

describe("bracket layout", () => {
  it.each(BRACKET_SIZES)("places every match of a %i-player bracket, none overlapping", (size) => {
    const map = bracket(size);
    const layout = layoutBracket(map, new Map(), options);
    expect(layout.positions.size).toBe(size - 1);
    const boxes = [...boxesOf(layout)];
    for (const [i, [a, p]] of boxes.entries()) {
      for (const [b, q] of boxes.slice(i + 1)) {
        const apartX = Math.abs(p.center.x - q.center.x) - (p.size.width + q.size.width) / 2;
        const apartY = Math.abs(p.center.y - q.center.y) - (p.size.height + q.size.height) / 2;
        expect(apartX >= 0 || apartY >= 0, `${a} and ${b} overlap`).toBe(true);
      }
    }
  });

  it.each(BRACKET_SIZES)("centres each match of a %i-player bracket between its two feeders", (size) => {
    const map = bracket(size);
    const layout = layoutBracket(map, new Map(), options);
    const grid = matchGrid(map);
    for (let r = 1; r < grid.length; r++) {
      grid[r].forEach((id, i) => {
        const top = layout.positions.get(grid[r - 1][2 * i])!;
        const bottom = layout.positions.get(grid[r - 1][2 * i + 1])!;
        expect(layout.positions.get(id)!.y).toBeCloseTo((top.y + bottom.y) / 2);
        // Right of what feeds it, an arrow length clear.
        expect(layout.positions.get(id)!.x - top.x).toBeCloseTo(options.fallbackSize.width + options.rowGap);
      });
    }
  });

  it("puts round 1 on the left, top to bottom, and the final alone on the right", () => {
    const map = bracket(8);
    const layout = layoutBracket(map, new Map(), options);
    const grid = matchGrid(map);
    const xs = grid.map((column) => new Set(column.map((id) => layout.positions.get(id)!.x)));
    for (const column of xs) expect(column.size).toBe(1);
    const columnX = xs.map((c) => [...c][0]);
    expect(columnX).toEqual([...columnX].sort((a, b) => a - b));
    const final = layout.positions.get(grid[2][0])!;
    for (const p of layout.positions.values()) expect(p.x).toBeLessThanOrEqual(final.x);
    const firstYs = grid[0].map((id) => layout.positions.get(id)!.y);
    expect(firstYs).toEqual([...firstYs].sort((a, b) => a - b));
    expect(firstYs[1] - firstYs[0]).toBe(options.fallbackSize.height + options.columnGap);
  });

  it("goes left to right whatever the map's direction says", () => {
    const map = { ...bracket(4), direction: "TB" as const };
    const a = layoutMap(map, new Map(), options, "TB");
    const b = layoutMap(map, new Map(), options, "LR");
    expect([...a.positions]).toEqual([...b.positions]);
    const grid = matchGrid(map);
    expect(a.positions.get(grid[1][0])!.x).toBeGreaterThan(a.positions.get(grid[0][0])!.x);
  });

  it("makes a column as wide as its widest match, and the bounds hold every box plus the room asked for", () => {
    const map = bracket(4);
    const grid = matchGrid(map);
    const sizes = new Map<NodeId, Size>([[grid[0][1], { width: 260, height: 64 }]]);
    const layout = layoutBracket(map, sizes, options, { above: 30, right: 200 });
    const final = layout.positions.get(grid[1][0])!;
    expect(final.x - options.fallbackSize.width / 2).toBe(260 + options.rowGap);
    expect(layout.bounds.left).toBe(0);
    expect(layout.bounds.top).toBe(options.columnGap / 2 - 30);
    expect(layout.bounds.right).toBe(final.x + options.fallbackSize.width / 2 + 200);
    const bottom = Math.max(...[...layout.positions.values()].map((p) => p.y + options.fallbackSize.height / 2));
    expect(layout.bounds.bottom).toBe(bottom);
  });

  it("lays out a map with no matches as nothing", () => {
    const map = { ...bracket(4), nodes: {} };
    expect(layoutBracket(map, new Map(), options).positions.size).toBe(0);
  });
});

describe("bracket headings and Champion box", () => {
  it("names each column over its middle, all at one height above the top match", () => {
    const map = bracket(16);
    const layout = layoutBracket(map, new Map(), options);
    const boxes = boxesOf(layout);
    const decor = bracketDecor(map, boxes, 12);
    expect(decor.headings.map((h) => h.text)).toEqual(roundNames(16));
    expect(decor.headings.map((h) => h.text)).toEqual(["Round 1", "Quarterfinals", "Semifinals", "Final"]);
    const grid = matchGrid(map);
    const top = Math.min(...[...boxes.values()].map((b) => b.center.y - b.size.height / 2));
    decor.headings.forEach((h, r) => {
      expect(h.x).toBe(layout.positions.get(grid[r][0])!.x);
      expect(h.bottom).toBe(top - 12);
    });
  });

  it("puts the Champion box right of the final, level with it", () => {
    const map = bracket(4);
    const layout = layoutBracket(map, new Map(), options);
    const final = layout.positions.get(matchGrid(map)[1][0])!;
    const { champion } = bracketDecor(map, boxesOf(layout), 12);
    expect(champion).toEqual({ left: final.x + options.fallbackSize.width / 2 + 12, y: final.y });
  });

  it("follows the matches where they are drawn (a glide, or not measured yet)", () => {
    let map = bracket(4);
    const slots = firstRoundSlots(map);
    for (const [i, s] of slots.entries()) map = renamePlayer(map, s.player, `P${i}`);
    map = setWinner(map, slots[0].match, slots[0].player)!.map;
    const grid = matchGrid(map);
    expect(bracketDecor(map, new Map(), 12)).toEqual({ headings: [], champion: null });
    const only = new Map<NodeId, Box>([[grid[0][0], { center: { x: 5, y: 50 }, size: { width: 10, height: 20 } }]]);
    const decor = bracketDecor(map, only, 12);
    expect(decor.headings).toEqual([{ round: 1, text: "Semifinals", x: 5, bottom: 40 - 12 }]);
    expect(decor.champion).toBeNull();
  });
});

describe("bracket layout with the first rounds hidden", () => {
  it.each([1, 2, 3])("lays the first round shown out as round 1, after hiding %i of a 16-player bracket's", (hidden) => {
    const full = bracket(16);
    const shown = shownMap(full, hidden);
    const layout = layoutBracket(shown, new Map(), options);
    const grid = matchGrid(full).slice(hidden);
    expect(layout.positions.size).toBe(grid.flat().length);
    // The same as a fresh bracket that size: from the top left, no gaps.
    const small = bracket((16 >> hidden) as (typeof BRACKET_SIZES)[number]);
    const smallLayout = layoutBracket(small, new Map(), options);
    const smallGrid = matchGrid(small);
    grid.forEach((column, r) =>
      column.forEach((id, i) => expect(layout.positions.get(id)).toEqual(smallLayout.positions.get(smallGrid[r][i]))),
    );
    expect(layout.bounds).toEqual(smallLayout.bounds);
  });

  it("heads only the rounds still shown", () => {
    const full = bracket(8);
    const layout = layoutBracket(shownMap(full, 1), new Map(), options);
    const decor = bracketDecor(full, boxesOf(layout), 12);
    expect(decor.headings.map((h) => h.text)).toEqual(["Semifinals", "Final"]);
    expect(decor.champion).not.toBeNull();
  });
});

describe("pinned later rounds", () => {
  const map = bracket(32);
  const layout = layoutBracket(map, new Map(), options);
  const grid = matchGrid(map);
  const h = options.fallbackSize.height;
  const top = Math.min(...grid[0].map((id) => layout.positions.get(id)!.y)) - h / 2;
  const bottom = Math.max(...grid[0].map((id) => layout.positions.get(id)!.y)) + h / 2;
  const pin = (from: number, viewTop: number, m = map) =>
    pinnedRounds(m, layout.positions, new Map(), options.fallbackSize, from, viewTop, 40, options.columnGap);

  it("packs the rounds from the one picked on, each still centred between its feeders, at the bracket's top", () => {
    // Semifinals of 32; the screen's top where the headings fit over round 1.
    const pins = pin(4, top - 40);
    expect([...pins.keys()].sort()).toEqual([...grid[3], ...grid[4]].sort());
    const qf = grid[3].map((id) => pins.get(id)!);
    expect(qf[0] - h / 2).toBeCloseTo(top);
    for (let i = 1; i < qf.length; i++) expect(qf[i] - qf[i - 1]).toBeCloseTo(h + options.columnGap);
    expect(pins.get(grid[4][0])).toBeCloseTo((qf[0] + qf[1]) / 2);
    // Earlier rounds keep their places: nothing for them.
    for (const id of grid[2]) expect(pins.has(id)).toBe(false);
  });

  it("follows the screen down as the page scrolls, below room for the headings", () => {
    const at0 = pin(4, top - 40).get(grid[3][0])!;
    const scrolled = pin(4, 500).get(grid[3][0])!;
    expect(scrolled - h / 2).toBeCloseTo(500 + 40);
    expect(at0 - h / 2).toBeCloseTo(top);
  });

  it("stops at the bracket's bottom", () => {
    const pins = pin(4, 1e6);
    const last = Math.max(...[...pins.values()]) + h / 2;
    expect(last).toBeCloseTo(bottom);
  });

  it("pins nothing from the first round shown or earlier, or past the final", () => {
    expect(pin(1, 500).size).toBe(0);
    expect(pin(5, 500).size).toBe(1); // the final alone
    expect(pin(6, 500).size).toBe(0);
    const shown = shownMap(map, 2); // rounds 1 and 2 hidden
    expect(pin(3, 500, shown).size).toBe(0);
    expect(pin(4, 500, shown).size).toBe(3);
  });

  it("puts the pinned rounds' headings over the pinned block, the others over round 1", () => {
    const pins = pin(4, 500);
    const boxes = new Map<NodeId, Box>(
      [...layout.positions].map(([id, c]) => [id, { center: { x: c.x, y: pins.get(id) ?? c.y }, size: options.fallbackSize }]),
    );
    const { headings } = bracketDecor(map, boxes, 16, 4);
    const bottoms = headings.map((x) => x.bottom);
    expect(bottoms.slice(0, 3).every((b) => Math.abs(b - (top - 16)) < 0.01)).toBe(true);
    expect(bottoms[3]).toBeCloseTo(500 + 40 - 16);
    expect(bottoms[4]).toBeCloseTo(500 + 40 - 16);
  });
});
