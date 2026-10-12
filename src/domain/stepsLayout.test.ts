import { describe, expect, it } from "vitest";

import { asLinkId, asMapId, asNodeId } from "./ids";
import { layoutMap, type MapLayout } from "./layout";
import { nextSteps } from "./order";
import { addBranch, addNext, createSteps, STEP_PRESETS } from "./steps";
import { buildSteps } from "./testMaps";
import type { LinkId, LinkMap, NodeId, Size, StepType } from "./types";

/** Tidy up's numbers for a tree-shaped map at Medium arrows. */
const options = { columnGap: 32, rowGap: 64, fallbackSize: { width: 100, height: 36 } };
const W = options.fallbackSize.width;
const H = options.fallbackSize.height;
const noSizes = new Map<NodeId, Size>();
const id = asNodeId;

const tidy = (map: LinkMap, sizes = noSizes, extra: { labelSizes?: Map<LinkId, Size> } = {}) =>
  layoutMap(map, sizes, { ...options, ...extra }, "TB");
const at = (layout: MapLayout, name: string) => layout.positions.get(id(name))!;

/** No two boxes overlap, and boxes in one row are at least a column gap
    apart. */
function expectApart(map: LinkMap, layout: MapLayout, sizes = noSizes) {
  const size = (n: NodeId) => sizes.get(n) ?? options.fallbackSize;
  const boxes = Object.keys(map.nodes) as NodeId[];
  expect(layout.positions.size).toBe(boxes.length);
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const p = layout.positions.get(a)!;
      const q = layout.positions.get(b)!;
      const apartX = Math.abs(p.x - q.x) - (size(a).width + size(b).width) / 2;
      const apartY = Math.abs(p.y - q.y) - (size(a).height + size(b).height) / 2;
      if (apartY < 0) expect(apartX, `${a} and ${b}`).toBeGreaterThanOrEqual(options.columnGap - 0.001);
    }
  }
}

/** 1 → 2 → 3 (a Yes / No) → Yes: 3a.1 → 3a.2, No: 3b.1, both joining 4 → 5. */
const splitAndJoin = (type: Exclude<StepType, "step" | "end"> = "yesno") =>
  buildSteps(
    "s1",
    ["s2", "s3", "y1", "y2", "n1", "s4", "s5"],
    [
      ["s1", "s2"],
      ["s2", "s3"],
      ["s3", "y1", "Yes"],
      ["s3", "n1", "No"],
      ["y1", "y2"],
      ["y2", "s4"],
      ["n1", "s4"],
      ["s4", "s5"],
    ],
    { s3: type },
  );

describe("Tidy up in a Steps map", () => {
  it("puts a straight process in one column, top to bottom", () => {
    const map = buildSteps("a", ["b", "c"], [["a", "b"], ["b", "c"]]);
    const layout = tidy(map);
    expect(["a", "b", "c"].map((n) => at(layout, n).x)).toEqual([0, 0, 0]);
    expect(["a", "b", "c"].map((n) => at(layout, n).y)).toEqual([H / 2, H / 2 + H + 64, H / 2 + 2 * (H + 64)]);
  });

  it("stands a split's branches side by side in sibling order, the split centred over them", () => {
    const map = buildSteps("q", ["yes", "no"], [["q", "yes", "Yes"], ["q", "no", "No"]], { q: "yesno" });
    const layout = tidy(map);
    expect(at(layout, "yes").y).toBe(at(layout, "no").y);
    expect(at(layout, "no").x - at(layout, "yes").x).toBe(W + 32);
    expect(at(layout, "q").x).toBe((at(layout, "yes").x + at(layout, "no").x) / 2);
  });

  it("centres a join under its branches, on its split's line, below the longer branch", () => {
    const layout = tidy(splitAndJoin());
    expect(at(layout, "s4").x).toBe(at(layout, "s3").x);
    expect(at(layout, "s5").x).toBe(at(layout, "s1").x);
    expect(at(layout, "s4").y).toBeGreaterThan(at(layout, "y2").y);
    // Each branch keeps its own column.
    expect(at(layout, "y1").x).toBe(at(layout, "y2").x);
    expect(at(layout, "y1").x).toBeLessThan(at(layout, "n1").x);
    expectApart(splitAndJoin(), layout);
  });

  it("lays out a Parallel split and its join the same way", () => {
    const layout = tidy(splitAndJoin("parallel"));
    expect(at(layout, "s4").x).toBe(at(layout, "s3").x);
    expect(at(layout, "s3").x).toBe((at(layout, "y1").x + at(layout, "n1").x) / 2);
  });

  it("keeps a split inside a branch centred over its own branches, clear of the other branch", () => {
    const map = buildSteps(
      "a",
      ["x", "x1", "x2", "o", "j"],
      [["a", "x"], ["a", "o"], ["x", "x1"], ["x", "x2"], ["x1", "j"], ["x2", "j"], ["o", "j"]],
      { a: "choice", x: "yesno" },
    );
    const layout = tidy(map);
    expect(at(layout, "x").x).toBe((at(layout, "x1").x + at(layout, "x2").x) / 2);
    expect(at(layout, "o").x).toBeGreaterThan(at(layout, "x2").x);
    expect(at(layout, "j").x).toBe(at(layout, "a").x);
    expectApart(map, layout);
  });

  it("runs an arrow straight into the join down its own lane, beside the branch", () => {
    // 1 → 2 (Yes / No): Yes → 2a.1 → 3; No → straight on to 3.
    const map = buildSteps("a", ["b", "y", "c"], [["a", "b"], ["b", "y", "Yes"], ["b", "c", "No"], ["y", "c"]], {
      b: "yesno",
    });
    const layout = tidy(map);
    expect(at(layout, "c").x).toBe(at(layout, "b").x);
    expect(at(layout, "a").x).toBe(at(layout, "b").x);
    // The straight line down from the split to the join misses the Yes box.
    expect(Math.abs(at(layout, "y").x - at(layout, "b").x)).toBeGreaterThanOrEqual(W + 32);
    expectApart(map, layout);
  });

  it("widens a branch's column for a wide label on the arrow into it", () => {
    const map = buildSteps("q", ["a", "b"], [["q", "a", "Option A"], ["q", "b", "Option B"]], { q: "choice" });
    const labelSizes = new Map<LinkId, Size>([[asLinkId("q>a"), { width: 300, height: 20 }]]);
    const layout = tidy(map, noSizes, { labelSizes });
    expect(at(layout, "b").x - at(layout, "a").x).toBe(300 / 2 + 32 + W / 2);
  });

  it("grows a row's gap by the tallest label on the arrows into it", () => {
    const map = buildSteps("q", ["a", "b"], [["q", "a", "Yes"], ["q", "b", "No"]], { q: "yesno" });
    const labelSizes = new Map<LinkId, Size>([[asLinkId("q>a"), { width: 30, height: 40 }]]);
    const layout = tidy(map, noSizes, { labelSizes });
    expect(at(layout, "a").y - at(layout, "q").y).toBe(H + 64 + 40);
  });

  it("is centred on x = 0, and its bounds hold every box", () => {
    const map = splitAndJoin();
    const layout = tidy(map);
    expect(layout.bounds.left).toBe(-layout.bounds.right);
    for (const p of layout.positions.values()) {
      expect(p.x - W / 2).toBeGreaterThanOrEqual(layout.bounds.left);
      expect(p.x + W / 2).toBeLessThanOrEqual(layout.bounds.right);
      expect(p.y + H / 2).toBeLessThanOrEqual(layout.bounds.bottom);
    }
  });

  it("turns on its side left-right: the process runs across, branches stacked", () => {
    const map = splitAndJoin();
    const layout = layoutMap(map, noSizes, options, "LR");
    expect(at(layout, "s1").y).toBe(at(layout, "s4").y);
    expect(at(layout, "s4").x).toBeGreaterThan(at(layout, "y2").x);
    expect(at(layout, "y1").x).toBe(at(layout, "n1").x);
  });

  it("keeps a branch that runs on past the join clear of the steps after it", () => {
    // 3-way choice: a runs on (5 steps), b and c join at j, then a wide split.
    const map = buildSteps(
      "q",
      ["a1", "a2", "a3", "a4", "a5", "b", "c", "j", "k", "k1", "k2", "k3"],
      [
        ["q", "a1"],
        ["q", "b"],
        ["q", "c"],
        ["a1", "a2"],
        ["a2", "a3"],
        ["a3", "a4"],
        ["a4", "a5"],
        ["b", "j"],
        ["c", "j"],
        ["j", "k"],
        ["k", "k1"],
        ["k", "k2"],
        ["k", "k3"],
      ],
      { q: "choice", k: "choice" },
    );
    expectApart(map, tidy(map));
  });

  it("places steps the start doesn't reach (damaged data) without overlap", () => {
    const map = buildSteps("a", ["b", "lost"], [["a", "b"]]);
    const fixed: LinkMap = { ...map, links: { ...map.links } };
    const layout = tidy(fixed);
    expectApart(fixed, layout);
  });

  it("lays out every preset with no overlap, the start at the top", () => {
    for (const preset of STEP_PRESETS) {
      const { map, startId } = createSteps(asMapId("m"), "M", { width: 800, height: 600 }, preset);
      const layout = tidy(map);
      expectApart(map, layout);
      expect(layout.positions.get(startId)!.y).toBe(H / 2);
    }
  });

  it("never overlaps, whatever the Add next menu builds (200 seeded random edits)", () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let n = 0;
    let l = 0;
    const newNode = () => id(`n${++n}`);
    const newLink = () => asLinkId(`l${++l}`);
    let map = createSteps(asMapId("m"), "M", { width: 800, height: 600 }, "blank", newNode, newLink).map;
    const types: StepType[] = ["step", "step", "step", "yesno", "choice", "parallel", "end"];
    for (let i = 0; i < 200; i++) {
      const boxes = Object.keys(map.nodes) as NodeId[];
      const box = boxes[Math.floor(random() * boxes.length)];
      const type = types[Math.floor(random() * types.length)];
      const next =
        nextSteps(map, box).length > 1 && random() < 0.5
          ? addBranch(map, box, newNode, newLink)?.map
          : addNext(map, box, type, newNode, newLink)?.map;
      if (next) map = next;
      if (i % 20 === 19) expectApart(map, tidy(map));
    }
    expect(Object.keys(map.nodes).length).toBeGreaterThan(60);
  });
});
