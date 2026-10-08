import { describe, expect, it } from "vitest";

import { forkBranch } from "./fork";
import { asMapId, asNodeId } from "./ids";
import { setCollapsed, setLinkLabel, setNodeColor, setNodeNotes, setNodesStatus } from "./map";
import { nextSteps } from "./order";
import { readMap, serializeMap } from "./persistence";
import { isStart } from "./rules";
import { build, buildTree } from "./testMaps";
import { startOf } from "./tree";
import type { LinkMap, NodeId } from "./types";

const id = asNodeId;
const M2 = asMapId("fork");
const byName = (map: LinkMap, name: string) => Object.values(map.nodes).find((n) => n.name === name)!;
const namesOf = (map: LinkMap, ids: readonly NodeId[]) => ids.map((n) => map.nodes[n].name);

/**  s
 *   ├─ a ─┬─ a1
 *   │     └─ a2 ── a2x
 *   └─ b
 */
function tree(): LinkMap {
  return buildTree("s", ["a", "b", "a1", "a2", "a2x"], [
    ["s", "a"],
    ["s", "b"],
    ["a", "a1", "if yes"],
    ["a", "a2"],
    ["a2", "a2x"],
  ]);
}

describe("forkBranch", () => {
  it("copies a box and everything after it into a new tree, the box its start", () => {
    const source = tree();
    const fork = forkBranch(source, id("a"), M2, [])!;
    expect(fork.id).toBe(M2);
    expect(fork.kind).toBe("tree");
    expect(Object.values(fork.nodes).map((n) => n.name).sort()).toEqual(["a", "a1", "a2", "a2x"]);
    expect(Object.keys(fork.links)).toHaveLength(3);
    const start = startOf(fork)!;
    expect(fork.nodes[start].name).toBe("a");
    expect(isStart(fork, start)).toBe(true);
    expect(namesOf(fork, nextSteps(fork, start))).toEqual(["a1", "a2"]);
    expect(Object.values(fork.links).find((l) => fork.nodes[l.to].name === "a1")?.label).toBe("if yes");
  });

  it("leaves the original untouched, and shares no ids with it", () => {
    const source = tree();
    const before = JSON.stringify(source);
    const fork = forkBranch(source, id("a"), M2, [])!;
    expect(JSON.stringify(source)).toBe(before);
    for (const n of Object.keys(fork.nodes)) expect(source.nodes[n as NodeId]).toBeUndefined();
  });

  it("keeps colours, notes, statuses, the order, folds and settings; drops the new start's status", () => {
    let source = tree();
    source = setNodeColor(source, id("a2"), "teal");
    source = setNodeNotes(source, id("a2x"), "why\nbecause");
    source = setNodesStatus(source, [id("a"), id("a1")], "cut");
    source = setCollapsed(source, [id("a2"), id("s")], true);
    source = { ...source, direction: "LR", arrowLength: 103, hideCut: true, order: { ...source.order, [id("a")]: [id("a2"), id("a1")] } };
    const fork = forkBranch(source, id("a"), M2, [])!;
    expect(byName(fork, "a").status).toBeNull();
    expect(byName(fork, "a1").status).toBe("cut");
    expect(byName(fork, "a2").color).toBe("teal");
    expect(byName(fork, "a2x").notes).toBe("why\nbecause");
    expect(fork.collapsed).toEqual([byName(fork, "a2").id]);
    expect(namesOf(fork, nextSteps(fork, byName(fork, "a").id))).toEqual(["a2", "a1"]);
    expect(fork).toMatchObject({ direction: "LR", arrowLength: 103, hideCut: true, trash: [] });
  });

  it("is never linked, and named after its start box (or untitled when that is blank)", () => {
    const linked = { ...tree(), linkedBoard: "s" };
    const fork = forkBranch(linked, id("a"), M2, [])!;
    expect(fork.linkedBoard).toBeUndefined();
    expect(fork.name).toBe("a");
    const blank = { ...tree(), nodes: { ...tree().nodes, [id("b")]: { ...tree().nodes[id("b")], name: "" } } };
    expect(forkBranch(blank, id("b"), M2, ["Untitled map"])!.name).toBe("Untitled map 2");
  });

  it("reads back as it was saved, with nothing to repair", () => {
    const fork = forkBranch(tree(), id("a"), M2, [])!;
    const read = readMap(JSON.parse(JSON.stringify(serializeMap(fork))), { width: 800, height: 600 });
    expect(read.status).toBe("ok");
  });

  it("in a connections map takes what the box needs, all the way down", () => {
    const map = setLinkLabel(build(["x", "y", "z", "w"], [["x", "y"], ["y", "z"], ["z", "y"], ["w", "x"]]), "x>y" as never, "uses");
    const fork = forkBranch(map, id("x"), M2, [])!;
    expect(fork.kind).toBe("connections");
    expect(Object.values(fork.nodes).map((n) => n.name)).toEqual(["x", "y", "z"]);
    expect(Object.values(fork.links).map((l) => l.label).sort()).toEqual(["needs", "needs", "uses"]);
    expect(fork.name).toBe("x");
  });

  it("returns null for a box that isn't there", () => {
    expect(forkBranch(tree(), id("nope"), M2, [])).toBeNull();
  });
});
