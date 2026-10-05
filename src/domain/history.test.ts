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
