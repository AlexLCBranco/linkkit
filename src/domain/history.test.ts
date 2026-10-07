import { describe, expect, it } from "vitest";

import { amendLast, discardLast, EMPTY_HISTORY, record, redo, undo } from "./history";
import { addLink, moveNode, renameNode, setNodeColor, setPage } from "./map";
import { build, ids } from "./testMaps";

const [a, b] = ids("a", "b");

describe("history", () => {
  it("undoes and redoes a step, keeping only the parts it changed", () => {
    const m0 = build(["a", "b"]);
    const m1 = renameNode(m0, a, "Alpha");
    const h1 = record(EMPTY_HISTORY, m0, m1);
    expect(h1.past[0].before).toEqual({ nodes: m0.nodes });

    const back = undo(h1, m1)!;
    expect(back.map).toEqual(m0);
    expect(back.map.links).toBe(m1.links);
    const again = redo(back.history, back.map)!;
    expect(again.map).toEqual(m1);
    expect(again.history.future).toHaveLength(0);
  });

  it("drops a step that changed nothing, and has nothing to undo when empty", () => {
    const m = build(["a"]);
    expect(record(EMPTY_HISTORY, m, m)).toBe(EMPTY_HISTORY);
    expect(undo(EMPTY_HISTORY, m)).toBeNull();
    expect(redo(EMPTY_HISTORY, m)).toBeNull();
  });

  it("clears what could be redone once a new step is made", () => {
    const m0 = build(["a"]);
    const m1 = setNodeColor(m0, a, "red");
    const back = undo(record(EMPTY_HISTORY, m0, m1), m1)!;
    const m2 = setPage(back.map, { width: 500, height: 500 });
    expect(record(back.history, back.map, m2).future).toHaveLength(0);
  });

  it("folds a drag into one step that undoes to where it began", () => {
    const m0 = build(["a", "b"], [["a", "b"]]);
    const m1 = moveNode(m0, a, { x: 10, y: 0 });
    const m2 = moveNode(m1, a, { x: 20, y: 0 });
    const m3 = setPage(m2, { width: 999, height: 600 });
    let h = record(EMPTY_HISTORY, m0, m1);
    h = amendLast(h, m1, m2);
    h = amendLast(h, m2, m3);
    expect(h.past).toHaveLength(1);
    expect(undo(h, m3)!.map).toEqual(m0);
  });

  it("records rather than amends when there is no step yet", () => {
    const m0 = build(["a"]);
    const m1 = moveNode(m0, a, { x: 5, y: 5 });
    expect(amendLast(EMPTY_HISTORY, m0, m1).past).toHaveLength(1);
  });

  it("discards the last step without leaving it to redo", () => {
    const m0 = build(["a", "b"]);
    const m1 = addLink(m0, a, b).map;
    const gone = discardLast(record(EMPTY_HISTORY, m0, m1), m1)!;
    expect(gone.map).toEqual(m0);
    expect(gone.history).toEqual(EMPTY_HISTORY);
  });
});

describe("history across a change from outside (step 26)", () => {
  // "Outside" = another tab's or Boardkit's change, taken in as a new map
  // object (new parts), the way the store takes it in.
  const outside = (map: ReturnType<typeof build>, edit: (m: ReturnType<typeof build>) => ReturnType<typeof build>) =>
    JSON.parse(JSON.stringify(edit(map))) as ReturnType<typeof build>;
  const [c] = ids("c");

  it("undoes only its own item, keeping what changed elsewhere", () => {
    const m0 = build(["a", "b", "c"], [["a", "b"]]);
    const m1 = renameNode(m0, a, "Alpha");
    const h = record(EMPTY_HISTORY, m0, m1);
    // Another tab renamed b and added an arrow meanwhile.
    const theirs = outside(m1, (m) => addLink(renameNode(m, b, "Beta"), b, c).map);
    const back = undo(h, theirs)!;
    expect(back.conflicts).toEqual([]);
    expect(back.map.nodes[a].name).toBe("a");
    expect(back.map.nodes[b].name).toBe("Beta");
    expect(Object.values(back.map.links).some((l) => l.from === b && l.to === c)).toBe(true);
    // And redo puts it back the same way.
    const again = redo(back.history, back.map)!;
    expect(again.conflicts).toEqual([]);
    expect(again.map.nodes[a].name).toBe("Alpha");
    expect(again.map.nodes[b].name).toBe("Beta");
  });

  it("refuses an undo whose item changed elsewhere, dropping it and every older step", () => {
    const m0 = build(["a", "b"]);
    const m1 = setNodeColor(m0, b, "red");
    const m2 = renameNode(m1, a, "Alpha");
    const m3 = moveNode(m2, b, { x: 9, y: 9 });
    let h = record(EMPTY_HISTORY, m0, m1);
    h = record(h, m1, m2);
    h = record(h, m2, m3);
    // Undo the move first, so there is something to redo.
    const back = undo(h, m3)!;
    // Another tab renamed a too.
    const theirs = outside(back.map, (m) => renameNode(m, a, "Ay"));
    const refused = undo(back.history, theirs)!;
    expect(refused.conflicts).toEqual([{ kind: "box", title: "Ay" }]);
    expect(refused.map).toBe(theirs);
    expect(refused.history.past).toEqual([]);
    // Redo keeps what was undone before the refusal.
    expect(refused.history.future).toEqual(back.history.future);
  });

  it("refuses a redo whose item changed elsewhere, dropping everything left to redo", () => {
    const m0 = build(["a"]);
    const m1 = renameNode(m0, a, "Alpha");
    const back = undo(record(EMPTY_HISTORY, m0, m1), m1)!;
    const theirs = outside(back.map, (m) => renameNode(m, a, "Ay"));
    const refused = redo(back.history, theirs)!;
    expect(refused.conflicts).toHaveLength(1);
    expect(refused.map).toBe(theirs);
    expect(refused.history.future).toEqual([]);
  });

  it("lets a step and a change elsewhere to different fields of one box both stand", () => {
    const m0 = build(["a"]);
    const m1 = moveNode(m0, a, { x: 40, y: 40 });
    const theirs = outside(m1, (m) => renameNode(m, a, "Alpha"));
    const back = undo(record(EMPTY_HISTORY, m0, m1), theirs)!;
    expect(back.conflicts).toEqual([]);
    expect(back.map.nodes[a]).toMatchObject({ name: "Alpha", x: m0.nodes[a].x, y: m0.nodes[a].y });
  });

  it("won't discard a step whose item changed elsewhere", () => {
    const m0 = build(["a"]);
    const m1 = renameNode(m0, a, "Alpha");
    const theirs = outside(m1, (m) => renameNode(m, a, "Ay"));
    expect(discardLast(record(EMPTY_HISTORY, m0, m1), theirs)).toBeNull();
  });
});
