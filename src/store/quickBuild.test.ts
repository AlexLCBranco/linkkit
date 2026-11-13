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
