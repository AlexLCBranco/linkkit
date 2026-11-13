import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NodeId } from "../domain/types";
import { memoryStorage } from "./memoryStorage";

/**
 * Making a map fast (the speed round, v0.0.115): the store's side of a
 * plain map's "+", the chain Enter keeps going, a flowchart's Enter and
 * a pasted list.
 */

/** The store reads localStorage when its module loads: a fresh copy each. */
async function freshStore() {
  vi.resetModules();
  return (await import("./mapStore")).useMapStore;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

/** A new plain map with one box, "A", at (200, 200). */
async function plainMap() {
  const useMapStore = await freshStore();
  const s = () => useMapStore.getState();
  s().newMap();
  const a = s().addBox({ x: 200, y: 200 });
  s().renameBox(a, "A");
  s().stopEditing();
  return { s, a };
}

const linksFrom = (s: () => { map: { links: Record<string, { from: NodeId; to: NodeId }> } }, from: NodeId) =>
  Object.values(s().map.links).filter((l) => l.from === from).map((l) => l.to);

describe("a plain map's + (addNextStep without tree rules)", () => {
  it("adds a box with an arrow from this one, just after it, its name open", async () => {
    const { s, a } = await plainMap();
    const b = s().addNextStep(a)!;
    expect(b).not.toBeNull();
    // The tree's offset, top-down: straight below.
    expect(s().map.nodes[b]).toMatchObject({ name: "", x: 200, y: 296 });
    expect(linksFrom(s, a)).toEqual([b]);
    expect(s().editing).toEqual({ kind: "box", id: b });
  });

  it("is one undo step: box and arrow go together, with the name typed", async () => {
    const { s, a } = await plainMap();
    const steps = s().history.past.length;
    const b = s().addNextStep(a)!;
    s().renameBox(b, "B");
    s().stopEditing();
    expect(s().history.past.length).toBe(steps + 1);
    s().undo();
    expect(s().map.nodes[b]).toBeUndefined();
    expect(Object.keys(s().map.links)).toHaveLength(0);
    expect(s().map.nodes[a].name).toBe("A");
  });

  it("steps aside when that spot is taken", async () => {
    const { s, a } = await plainMap();
    const b = s().addNextStep(a)!;
    s().renameBox(b, "B");
    s().stopEditing();
    const c = s().addNextStep(a)!;
    expect(s().map.nodes[c].y).toBe(296);
    expect(s().map.nodes[c].x).toBeGreaterThanOrEqual(200 + 120 + 16);
    expect(linksFrom(s, a)).toEqual([b, c]);
  });

  it("goes where it is asked to (an arrow let go on bare paper)", async () => {
    const { s, a } = await plainMap();
    const b = s().addNextStep(a, { x: 500, y: 420 })!;
    expect(s().map.nodes[b]).toMatchObject({ x: 500, y: 420 });
    expect(linksFrom(s, a)).toEqual([b]);
  });

  it("Esc on it still blank takes box and arrow back, leaving no undo step", async () => {
    const { s, a } = await plainMap();
    const steps = s().history.past.length;
    const before = s().map;
    s().addNextStep(a);
    s().stopEditing(true);
    expect(s().map).toEqual(before);
    expect(s().history.past.length).toBe(steps);
  });
});

describe("Enter keeps the chain going (enterOnBox)", () => {
  it("keeps the name and opens another new box from the same parent, beside the last", async () => {
    const { s, a } = await plainMap();
    const b = s().addNextStep(a)!;
    s().enterOnBox(b, "B");
    expect(s().map.nodes[b].name).toBe("B");
    const c = s().editing!.id as NodeId;
    expect(c).not.toBe(b);
    expect(linksFrom(s, a)).toEqual([b, c]);
    expect(s().map.nodes[c].y).toBe(s().map.nodes[b].y);
    expect(s().map.nodes[c].x).toBeGreaterThan(s().map.nodes[b].x);
    // And again.
    s().enterOnBox(c, "C");
    expect(linksFrom(s, a)).toHaveLength(3);
    expect(s().editing!.id).not.toBe(c);
  });

  it("left blank, the chain stops and only the blank box goes", async () => {
    const { s, a } = await plainMap();
    const b = s().addNextStep(a)!;
    s().enterOnBox(b, "B");
    const c = s().editing!.id as NodeId;
    const steps = s().history.past.length;
    s().enterOnBox(c, "");
    expect(s().editing).toBeNull();
    expect(s().map.nodes[c]).toBeUndefined();
    expect(Object.values(s().map.nodes).map((n) => n.name).sort()).toEqual(["A", "B"]);
    expect(linksFrom(s, a)).toEqual([b]);
    expect(s().history.past.length).toBe(steps - 1);
  });

  it("Esc (or a click away) on the blank one does the same", async () => {
    const { s, a } = await plainMap();
    const b = s().addNextStep(a)!;
    s().enterOnBox(b, "B");
    s().stopEditing(true);
    expect(Object.values(s().map.nodes).map((n) => n.name).sort()).toEqual(["A", "B"]);
    expect(s().chain).toBeNull();
  });

  it("an empty name never deletes a box that already had a name", async () => {
    const { s, a } = await plainMap();
    const b = s().addNextStep(a)!;
    s().enterOnBox(b, "B");
    s().stopEditing(true);
    // Renamed later, B is no longer "just added": blank stays a blank box.
    s().startEditing({ kind: "box", id: b });
    s().enterOnBox(b, "");
    expect(s().map.nodes[b]).toMatchObject({ name: "" });
    expect(s().editing).toBeNull();
    s().startEditing({ kind: "box", id: a });
    s().stopEditing(true);
    expect(s().map.nodes[a].name).toBe("A");
    expect(linksFrom(s, a)).toEqual([b]);
  });

  it("a later rename of a chained box does not start a chain again", async () => {
    const { s, a } = await plainMap();
    const b = s().addNextStep(a)!;
    s().enterOnBox(b, "B");
    s().stopEditing(true);
    s().startEditing({ kind: "box", id: b });
    s().enterOnBox(b, "B2");
    expect(s().editing).toBeNull();
    expect(Object.keys(s().map.nodes)).toHaveLength(2);
  });
});

describe("a flowchart's Enter (enterOnBox in a Steps map)", () => {
  async function yesNo() {
    const useMapStore = await freshStore();
    const s = () => useMapStore.getState();
    s().newSteps();
    const start = Object.keys(s().map.nodes)[0] as NodeId;
    s().placeAll(new Map([[start, { x: 300, y: 100 }]]), { width: 900, height: 600 });
    s().enterOnBox(start, "Ready?");
    const first = s().addStep(start, "yesno")!;
    const second = (Object.keys(s().map.nodes) as NodeId[]).find((n) => n !== start && n !== first)!;
    return { s, start, first, second };
  }

  it("keeps the name and opens the next unnamed branch, selected; after the last it stops", async () => {
    const { s, first, second } = await yesNo();
    expect(s().editing).toEqual({ kind: "box", id: first });
    s().enterOnBox(first, "Go");
    expect(s().map.nodes[first].name).toBe("Go");
    expect(s().editing).toEqual({ kind: "box", id: second });
    expect(s().selected).toBe(second);
    s().enterOnBox(second, "Stop");
    expect(s().editing).toBeNull();
    expect(s().map.nodes[first].name).toBe("Go");
    expect(s().map.nodes[second].name).toBe("Stop");
  });

  it("Esc on the second branch, still blank, keeps both branches", async () => {
    const { s, first, second } = await yesNo();
    s().enterOnBox(first, "Go");
    s().stopEditing(true);
    expect(s().map.nodes[first].name).toBe("Go");
    expect(s().map.nodes[second]).toBeDefined();
  });

  it("a first branch left blank is kept, and the second opens", async () => {
    const { s, first, second } = await yesNo();
    s().enterOnBox(first, "");
    expect(s().map.nodes[first]).toBeDefined();
    expect(s().editing).toEqual({ kind: "box", id: second });
  });
});

describe("a list pasted onto the map (pasteList)", () => {
  it("with a box picked: each line a box under it, its name kept, one undo step", async () => {
    const { s, a } = await plainMap();
    const steps = s().history.past.length;
    expect(s().pasteList("One\nTwo\n  Two and a half\nThree", a)).toBe(4);
    const byName = Object.fromEntries(Object.values(s().map.nodes).map((n) => [n.name, n.id]));
    expect(Object.keys(byName).sort()).toEqual(["A", "One", "Three", "Two", "Two and a half"]);
    expect(linksFrom(s, a).sort()).toEqual([byName.One, byName.Two, byName.Three].sort());
    expect(linksFrom(s, byName.Two)).toEqual([byName["Two and a half"]]);
    // The canvas places them as a block beside the box.
    expect(s().placeRequest).toMatchObject({ anchor: a });
    expect(s().placeRequest!.ids).toHaveLength(4);
    expect(s().history.past.length).toBe(steps + 1);
    s().undo();
    expect(Object.values(s().map.nodes).map((n) => n.name)).toEqual(["A"]);
  });

  it("with nothing picked: new boxes standing on their own, picked", async () => {
    const { s } = await plainMap();
    expect(s().pasteList("One\nTwo\nThree", null)).toBe(3);
    expect(Object.values(s().map.nodes).map((n) => n.name).sort()).toEqual(["A", "One", "Three", "Two"]);
    expect(Object.keys(s().map.links)).toHaveLength(0);
    expect(s().placeRequest).toMatchObject({ anchor: null });
    expect(s().group).toHaveLength(3);
  });

  it("in a tree: children of the picked box; with none picked, nothing (a box needs a parent)", async () => {
    const useMapStore = await freshStore();
    const s = () => useMapStore.getState();
    s().newTree();
    const start = Object.keys(s().map.nodes)[0] as NodeId;
    s().placeAll(new Map([[start, { x: 300, y: 100 }]]), { width: 900, height: 600 });
    s().stopEditing();
    const before = s().map;
    expect(s().pasteList("One\nTwo", null)).toBe(0);
    expect(s().map).toBe(before);
    expect(s().pasteList("One\nTwo", start)).toBe(2);
    expect(linksFrom(s, start)).toHaveLength(2);
  });

  it("in a flowchart: nothing", async () => {
    const useMapStore = await freshStore();
    const s = () => useMapStore.getState();
    s().newSteps();
    const start = Object.keys(s().map.nodes)[0] as NodeId;
    const before = s().map;
    expect(s().pasteList("One\nTwo", start)).toBe(0);
    expect(s().map).toBe(before);
  });
});
