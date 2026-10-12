import { describe, expect, it } from "vitest";

import { asLinkId, asMapId, asNodeId } from "./ids";
import { nextSteps } from "./order";
import { readMap, serializeMap } from "./persistence";
import { canLink, parentsOf } from "./rules";
import { addBranch, addNext, branchLetter, createSteps, deleteStep, stepNumbers, stepTypeOf } from "./steps";
import { buildSteps, buildTree } from "./testMaps";
import type { LinkMap, NodeId } from "./types";

const id = asNodeId;
const page = { width: 800, height: 600 };

/** Numbers by box name, for readable expectations. */
const numbers = (map: LinkMap): Record<string, string> => Object.fromEntries(stepNumbers(map));

/** Ids handed out in order: n1, n2 … and l1, l2 … */
function counters() {
  let n = 0;
  let l = 0;
  return { node: () => id(`n${++n}`), link: () => asLinkId(`l${++l}`) };
}

/** Every box but the start has a parent, and every box is numbered. */
function expectWhole(map: LinkMap) {
  const boxes = Object.keys(map.nodes) as NodeId[];
  expect(boxes.filter((b) => parentsOf(map, b).length === 0)).toHaveLength(1);
  expect(stepNumbers(map).size).toBe(boxes.length);
}

describe("branch letters", () => {
  it("go a … z, then aa, ab", () => {
    expect([0, 1, 25, 26, 27].map(branchLetter)).toEqual(["a", "b", "z", "aa", "ab"]);
  });
});

describe("numbering", () => {
  it("counts a straight path 1, 2, 3", () => {
    const map = buildSteps("a", ["b", "c"], [["a", "b"], ["b", "c"]]);
    expect(numbers(map)).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("letters the branches of one split, steps inside numbered 3a.1, 3a.2", () => {
    const map = buildSteps(
      "a",
      ["b", "c", "y1", "y2", "n1"],
      [["a", "b"], ["b", "c"], ["c", "y1", "Yes"], ["c", "n1", "No"], ["y1", "y2"]],
      { c: "yesno" },
    );
    expect(numbers(map)).toEqual({ a: "1", b: "2", c: "3", y1: "3a.1", y2: "3a.2", n1: "3b.1" });
  });

  it("numbers a split inside a branch from that branch", () => {
    const map = buildSteps(
      "a",
      ["c", "x", "x1", "x2", "o"],
      [["a", "c"], ["c", "x"], ["c", "o"], ["x", "x1"], ["x", "x2"]],
      { c: "choice", x: "yesno" },
    );
    expect(numbers(map)).toEqual({ a: "1", c: "2", x: "2a.1", x1: "2a.1a.1", x2: "2a.1b.1", o: "2b.1" });
  });

  it("goes back to the main count after a join, whatever the branches' lengths", () => {
    const map = buildSteps(
      "a",
      ["s", "y1", "y2", "n1", "j", "k"],
      [["a", "s"], ["s", "y1"], ["s", "n1"], ["y1", "y2"], ["y2", "j"], ["n1", "j"], ["j", "k"]],
      { s: "yesno" },
    );
    expect(numbers(map)).toMatchObject({ s: "2", y2: "2a.2", n1: "2b.1", j: "3", k: "4" });
  });

  it("joins parallel branches the same way", () => {
    const map = buildSteps(
      "a",
      ["p", "b1", "b2", "b3", "j"],
      [["a", "p"], ["p", "b1"], ["p", "b2"], ["p", "b3"], ["b1", "j"], ["b2", "j"], ["b3", "j"]],
      { p: "parallel" },
    );
    expect(numbers(map)).toEqual({ a: "1", p: "2", b1: "2a.1", b2: "2b.1", b3: "2c.1", j: "3" });
  });

  it("keeps a join inside a branch on that branch's count", () => {
    const map = buildSteps(
      "a",
      ["s", "x", "x1", "x2", "xj", "o"],
      [["a", "s"], ["s", "x"], ["s", "o"], ["x", "x1"], ["x", "x2"], ["x1", "xj"], ["x2", "xj"]],
      { s: "yesno", x: "yesno" },
    );
    expect(numbers(map)).toMatchObject({ x: "2a.1", x1: "2a.1a.1", x2: "2a.1b.1", xj: "2a.2", o: "2b.1" });
  });

  it("gives no letter to an arrow straight from a split into its join", () => {
    // Yes: do something, then go on; No: go straight on.
    const map = buildSteps("a", ["y", "j"], [["a", "y", "Yes"], ["a", "j", "No"], ["y", "j"]], { a: "yesno" });
    expect(numbers(map)).toEqual({ a: "1", y: "1a.1", j: "2" });
  });

  it("continues after the furthest parent when a branch joins a later main step", () => {
    const map = buildSteps(
      "a",
      ["s", "y", "n", "j", "k", "l"],
      [["a", "s"], ["s", "y"], ["s", "n"], ["y", "j"], ["n", "j"], ["j", "k"], ["k", "l"]],
      { s: "yesno" },
    );
    // A third way in: from inside the split straight on to "l".
    const joined = buildSteps(
      "a",
      ["s", "y", "y2", "n", "j", "k", "l"],
      [["a", "s"], ["s", "y"], ["s", "n"], ["y", "y2"], ["y2", "l"], ["n", "j"], ["j", "k"], ["k", "l"]],
      { s: "yesno" },
    );
    expect(numbers(map)).toMatchObject({ j: "3", k: "4", l: "5" });
    expect(numbers(joined)).toMatchObject({ n: "2b.1", j: "2b.2", k: "2b.3", l: "3" });
  });
});

describe("the rules (Steps)", () => {
  const map = () =>
    buildSteps(
      "a",
      ["s", "y", "n", "e", "j"],
      [["a", "s"], ["s", "y", "Yes"], ["s", "n", "No"], ["n", "e"], ["y", "j"]],
      { s: "yesno", e: "end" },
    );

  it("lets the end of a branch join a later step", () => {
    const m = buildSteps("a", ["s", "y", "n", "j"], [["a", "s"], ["s", "y"], ["s", "n"], ["y", "j"]], { s: "yesno" });
    expect(canLink(m, id("n"), id("j"))).toEqual({ ok: true });
  });

  it("never lets a join target an earlier step (no loops in this version)", () => {
    const m = buildSteps("a", ["s", "y", "n"], [["a", "s"], ["s", "y"], ["s", "n"]], { s: "yesno" });
    expect(canLink(m, id("y"), id("s"))).toEqual({ ok: false, reason: "loop" });
    expect(canLink(m, id("n"), id("a"))).toEqual({ ok: false, reason: "start" });
  });

  it("refuses an arrow out of an End, a step that already goes on, or a split", () => {
    expect(canLink(map(), id("e"), id("j"))).toEqual({ ok: false, reason: "end" });
    expect(canLink(map(), id("n"), id("j"))).toEqual({ ok: false, reason: "goes-on" });
    expect(canLink(map(), id("s"), id("j"))).toEqual({ ok: false, reason: "goes-on" });
  });

  it("adds nothing after an End", () => {
    expect(addNext(map(), id("e"), "step")).toBeNull();
  });
});

describe("Add next", () => {
  const blank = () => {
    const c = counters();
    const { map, startId } = createSteps(asMapId("s"), "Steps", page, "blank", c.node, c.link);
    return { map, startId, c };
  };

  it("adds a step after the last one", () => {
    const { map, startId, c } = blank();
    const added = addNext(map, startId, "step", c.node, c.link)!;
    expect(nextSteps(added.map, startId)).toEqual(added.nodeIds);
    expect(numbers(added.map)[added.nodeIds[0]]).toBe("2");
  });

  it("puts a new step in between, the rest following it", () => {
    const { map, startId, c } = blank();
    const first = addNext(map, startId, "step", c.node, c.link)!;
    const [two] = first.nodeIds;
    const after = addNext(first.map, startId, "step", c.node, c.link)!;
    const [mid] = after.nodeIds;
    expect(numbers(after.map)[mid]).toBe("2");
    expect(numbers(after.map)[two]).toBe("3");
    expect(nextSteps(after.map, mid)).toEqual([two]);
    expectWhole(after.map);
  });

  it("makes Yes / No, Choice and Parallel splits with labelled branches", () => {
    const { map, startId, c } = blank();
    const yesNo = addNext(map, startId, "yesno", c.node, c.link)!;
    const labels = (m: LinkMap) => nextSteps(m, startId).map((n) => Object.values(m.links).find((l) => l.to === n)!.label);
    expect(stepTypeOf(yesNo.map, startId)).toBe("yesno");
    expect(labels(yesNo.map)).toEqual(["Yes", "No"]);
    expect(labels(addNext(map, startId, "choice", c.node, c.link)!.map)).toEqual(["Option A", "Option B", "Option C"]);
    expect(labels(addNext(map, startId, "parallel", c.node, c.link)!.map)).toEqual(["", ""]);
  });

  it("joins every branch back into what came next when a split goes in between", () => {
    const { map, startId, c } = blank();
    const first = addNext(map, startId, "step", c.node, c.link)!;
    const [next] = first.nodeIds;
    const split = addNext(first.map, startId, "yesno", c.node, c.link)!;
    expect(parentsOf(split.map, next).sort()).toEqual([...split.nodeIds].sort());
    expect(numbers(split.map)[next]).toBe("2");
  });

  it("adds Choice branches with the next letter, never on Yes / No", () => {
    const { map, startId, c } = blank();
    const choice = addNext(map, startId, "choice", c.node, c.link)!.map;
    const more = addBranch(choice, startId, c.node, c.link)!;
    expect(Object.values(more.map.links).find((l) => l.to === more.nodeId)!.label).toBe("Option D");
    expect(numbers(more.map)[more.nodeId]).toBe("1d.1");
    expect(addBranch(addNext(map, startId, "yesno", c.node, c.link)!.map, startId)).toBeNull();
  });

  it("adds no second next step to a split (that is addBranch's job)", () => {
    const { map, startId, c } = blank();
    expect(addNext(addNext(map, startId, "yesno", c.node, c.link)!.map, startId, "step")).toBeNull();
  });
});

describe("deleting a step", () => {
  const split = () =>
    buildSteps(
      "a",
      ["s", "y1", "y2", "y3", "n1", "j", "k"],
      [["a", "s"], ["s", "y1", "Yes"], ["s", "n1", "No"], ["y1", "y2"], ["y2", "y3"], ["y3", "j"], ["n1", "j"], ["j", "k"]],
      { s: "yesno" },
    );

  it("renumbers a branch at once when one of its steps goes", () => {
    const map = deleteStep(split(), id("y1"));
    expect(numbers(map)).toMatchObject({ y2: "2a.1", y3: "2a.2", j: "3" });
    // The branch's first arrow keeps its label.
    expect(Object.values(map.links).find((l) => l.to === id("y2"))!.label).toBe("Yes");
    expectWhole(map);
  });

  it("deleting a join leaves both branches leading on, nothing loose", () => {
    const map = deleteStep(split(), id("j"));
    expect(parentsOf(map, id("k")).sort()).toEqual(["n1", "y3"]);
    expect(numbers(map)).toMatchObject({ y3: "2a.3", n1: "2b.1", k: "3" });
    expectWhole(map);
  });

  it("deleting a join with nothing after it leaves each branch ending where it is", () => {
    const map = deleteStep(deleteStep(split(), id("k")), id("j"));
    expect(Object.keys(map.nodes).sort()).toEqual(["a", "n1", "s", "y1", "y2", "y3"]);
    expectWhole(map);
  });

  it("a branch's only step going straight into the join leaves a labelled arrow there", () => {
    const map = deleteStep(split(), id("n1"));
    expect(Object.values(map.links).find((l) => l.from === id("s") && l.to === id("j"))!.label).toBe("No");
    expect(numbers(map)).toMatchObject({ j: "3" });
    expectWhole(map);
  });

  it("deleting a split takes its branches and joins what came before to what came after", () => {
    const map = deleteStep(split(), id("s"));
    expect(Object.keys(map.nodes).sort()).toEqual(["a", "j", "k"]);
    expect(numbers(map)).toEqual({ a: "1", j: "2", k: "3" });
  });

  it("never deletes the start", () => {
    const map = split();
    expect(deleteStep(map, id("a"))).toBe(map);
  });
});

describe("presets", () => {
  it("blank is one empty step", () => {
    const { map, startId } = createSteps(asMapId("s"), "Steps", page);
    expect(map.kind).toBe("steps");
    expect(Object.keys(map.nodes)).toEqual([startId]);
    expect(map.nodes[startId].name).toBe("");
  });

  it("simple decision: a Yes / No question with an End on each side", () => {
    const { map, startId } = createSteps(asMapId("s"), "Steps", page, "decision");
    const ends = nextSteps(map, startId);
    expect(stepTypeOf(map, startId)).toBe("yesno");
    expect(ends.map((e) => stepTypeOf(map, e))).toEqual(["end", "end"]);
    expect(ends.map((e) => numbers(map)[e])).toEqual(["1a.1", "1b.1"]);
  });

  it("process with check: 1, 2, a Yes / No check, an End on each side", () => {
    const { map } = createSteps(asMapId("s"), "Steps", page, "check");
    const byName = Object.fromEntries(Object.values(map.nodes).map((n) => [n.name, numbers(map)[n.id]]));
    expect(byName).toEqual({ "Get the request": "1", "Do the work": "2", "Is it right?": "3", Done: "3a.1", "Fix it": "3b.1" });
  });
});

describe("saving and loading", () => {
  it("keeps step types, labels and joins", () => {
    const map = buildSteps(
      "a",
      ["p", "b1", "b2", "j", "e"],
      [["a", "p"], ["p", "b1", "first"], ["p", "b2", "second"], ["b1", "j"], ["b2", "j"], ["j", "e"]],
      { p: "parallel", e: "end" },
    );
    const read = readMap(JSON.parse(JSON.stringify(serializeMap(map))), page);
    expect(read.status).toBe("ok");
    if (read.status === "unreadable") return;
    expect(read.map.kind).toBe("steps");
    expect(read.map.nodes).toEqual(map.nodes);
    expect(read.map.links).toEqual(map.links);
    expect(read.map.order).toEqual(map.order);
    expect(numbers(read.map)).toEqual(numbers(map));
  });

  it("drops a step type anywhere but a Steps map, or one it doesn't know, as a repair", () => {
    const tree = buildTree("a", ["b"], [["a", "b"]]);
    const saved = serializeMap(tree);
    const withType = (kind: string, stepType: string) =>
      readMap({ ...saved, map: { ...saved.map, kind, nodes: { ...saved.map.nodes, b: { ...saved.map.nodes[id("b")], stepType } } } }, page);
    expect(withType("tree", "end").status).toBe("repaired");
    expect(withType("steps", "loop").status).toBe("repaired");
    const ok = withType("steps", "end");
    expect(ok.status).toBe("ok");
    if (ok.status !== "unreadable") expect(ok.map.nodes[id("b")].stepType).toBe("end");
  });
});
