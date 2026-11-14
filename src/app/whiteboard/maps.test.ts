import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MapId, NodeId } from "../../domain/types";
import { memoryStorage } from "../../store/memoryStorage";

/**
 * What the gauntlet whiteboard calls to start typing at once (v0.0.115):
 * a new map's first box, and a box at a point, each with its name open in
 * the gesture that starts editing.
 */

const PAGE = { width: 900, height: 560 };

/** Fresh modules, as the whiteboard loads them (embed mode, no map open). */
async function load() {
  vi.resetModules();
  await import("./prepare");
  const maps = await import("./maps");
  const { useMapStore } = await import("../../store/mapStore");
  const persist = await import("../../store/persistMap");
  const { createTree } = await import("../../domain/tree");
  return { ...maps, s: () => useMapStore.getState(), persist, createTree };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openWhiteboardMapWithFirstBox", () => {
  it("opens a new empty map with a first box whose name is open", async () => {
    const w = await load();
    const made = w.createWhiteboardMap()!;
    const { opened, boxId } = w.openWhiteboardMapWithFirstBox(made.id);
    expect(opened).toBe(true);
    expect(boxId).not.toBeNull();
    expect(w.s().map.id).toBe(made.id);
    expect(Object.keys(w.s().map.nodes)).toEqual([boxId]);
    expect(w.s().editing).toEqual({ kind: "box", id: boxId });
    // On the page, clear of its corner, and the map's shift untouched.
    expect(w.s().map.nodes[boxId as NodeId].x).toBeGreaterThan(0);
    expect(w.s().map.nodes[boxId as NodeId].y).toBeGreaterThan(0);
    expect(w.s().map.shift).toBeUndefined();
    // Esc on it still blank leaves the map empty again.
    w.s().stopEditing(true);
    expect(Object.keys(w.s().map.nodes)).toHaveLength(0);
  });

  it("adds nothing to a map that has boxes, or to a decision tree, but still opens it", async () => {
    const w = await load();
    const made = w.createWhiteboardMap()!;
    const first = w.openWhiteboardMapWithFirstBox(made.id).boxId!;
    w.s().enterOnBox(first as NodeId, "Hello");
    expect(w.openWhiteboardMapWithFirstBox(made.id)).toEqual({ opened: true, boxId: null });
    expect(Object.keys(w.s().map.nodes)).toHaveLength(1);

    const { map: tree } = w.createTree("tree1" as MapId, "A tree", PAGE);
    w.persist.saveMap(tree);
    expect(w.openWhiteboardMapWithFirstBox("tree1")).toEqual({ opened: true, boxId: null });
    expect(Object.keys(w.s().map.nodes)).toHaveLength(1);
  });

  it("says so when the map isn't there", async () => {
    const w = await load();
    expect(w.openWhiteboardMapWithFirstBox("nope")).toEqual({ opened: false, boxId: null });
  });
});

describe("addWhiteboardMapBox", () => {
  it("opens a map that is not being edited and adds a box at the point, name open", async () => {
    const w = await load();
    const made = w.createWhiteboardMap()!;
    expect(w.s().map.id).not.toBe(made.id);
    const id = w.addWhiteboardMapBox(made.id, { x: 400, y: 300 })!;
    expect(w.s().map.id).toBe(made.id);
    expect(w.s().map.nodes[id as NodeId]).toMatchObject({ x: 400, y: 300, name: "" });
    expect(w.s().editing).toEqual({ kind: "box", id });
  });

  it("steps to the nearest free spot when a box is there already", async () => {
    const w = await load();
    const made = w.createWhiteboardMap()!;
    const a = w.addWhiteboardMapBox(made.id, { x: 400, y: 300 })!;
    w.s().enterOnBox(a as NodeId, "A");
    const b = w.addWhiteboardMapBox(made.id, { x: 400, y: 300 })!;
    const [na, nb] = [w.s().map.nodes[a as NodeId], w.s().map.nodes[b as NodeId]];
    expect(Math.abs(na.x - nb.x) >= 120 || Math.abs(na.y - nb.y) >= 40).toBe(true);
  });

  it("left of the page's corner, everything else makes way (the map's shift)", async () => {
    const w = await load();
    const made = w.createWhiteboardMap()!;
    const a = w.addWhiteboardMapBox(made.id, { x: 400, y: 300 })!;
    w.s().enterOnBox(a as NodeId, "A");
    const b = w.addWhiteboardMapBox(made.id, { x: -200, y: 300 })!;
    expect(w.s().map.nodes[b as NodeId].x).toBeGreaterThan(0);
    expect(w.s().map.shift!.x).toBeGreaterThan(200);
    expect(w.s().map.nodes[a as NodeId].x).toBe(400 + w.s().map.shift!.x);
  });

  it("adds nothing to a decision tree (its boxes grow from a box), or to a map that isn't there", async () => {
    const w = await load();
    const { map: tree } = w.createTree("tree1" as MapId, "A tree", PAGE);
    w.persist.saveMap(tree);
    expect(w.addWhiteboardMapBox("tree1", { x: 400, y: 300 })).toBeNull();
    expect(w.addWhiteboardMapBox("nope", { x: 400, y: 300 })).toBeNull();
  });
});

describe("whiteboardMapPagePoint and addWhiteboardMapBoxAtScreenPoint", () => {
  /** The map's page as drawn: its corner at (100, 50) on screen, at half size. */
  function drawn(mapId: string) {
    const page = {
      offsetWidth: 800,
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 300 }),
      querySelectorAll: () => [],
    };
    vi.stubGlobal("document", {
      querySelector: (selector: string) => (selector.includes(`[data-map-id="${mapId}"]`) ? page : null),
    });
  }

  it("reads a screen point against the map as drawn, the whiteboard's zoom allowed for", async () => {
    const w = await load();
    drawn("m1");
    expect(w.whiteboardMapPagePoint("m1", 100, 50)).toEqual({ x: 0, y: 0 });
    expect(w.whiteboardMapPagePoint("m1", 300, 200)).toEqual({ x: 400, y: 300 });
    expect(w.whiteboardMapPagePoint("other", 300, 200)).toBeNull();
  });

  it("adds the box where the screen point is on the page, name open", async () => {
    const w = await load();
    const made = w.createWhiteboardMap()!;
    drawn(made.id);
    const id = w.addWhiteboardMapBoxAtScreenPoint(made.id, 300, 200)!;
    expect(w.s().map.nodes[id as NodeId]).toMatchObject({ x: 400, y: 300 });
    expect(w.s().editing).toEqual({ kind: "box", id });
  });
});

describe("copyWhiteboardMap / readWhiteboardMap / writeWhiteboardMap / deleteWhiteboardMap (copies on the whiteboard)", () => {
  it("copies a map under a new id and a copy's name, listed, its boxes kept; the original untouched", async () => {
    const w = await load();
    const { map: tree } = w.createTree("tree1" as MapId, "Week 46", PAGE);
    w.persist.saveMap(tree);
    const made = w.copyWhiteboardMap("tree1")!;
    expect(made.id).not.toBe("tree1");
    expect(made.name).toBe("Week 46 (copy)");
    expect(w.whiteboardMaps().map((m) => m.name)).toContain("Week 46 (copy)");
    const copy = w.readWhiteboardMap(made.id)!;
    expect(Object.keys(copy.nodes)).toEqual(Object.keys(tree.nodes));
    expect(copy.linkedBoard).toBeUndefined();
    expect(w.readWhiteboardMap("tree1")!.name).toBe("Week 46");
    // A second copy is named apart.
    expect(w.copyWhiteboardMap("tree1")!.name).toBe("Week 46 (copy 2)");
  });

  it("deletes a copy for good and puts it back as it was", async () => {
    const w = await load();
    const { map: tree } = w.createTree("tree1" as MapId, "Week 46", PAGE);
    w.persist.saveMap(tree);
    const made = w.copyWhiteboardMap("tree1")!;
    const kept = w.readWhiteboardMap(made.id)!;
    expect(w.deleteWhiteboardMap(made.id)).toBe(true);
    expect(w.readWhiteboardMap(made.id)).toBeNull();
    expect(w.whiteboardMaps().map((m) => m.id)).not.toContain(made.id);
    expect(w.writeWhiteboardMap(kept)).toBe(true);
    expect(w.readWhiteboardMap(made.id)).toEqual(kept);
    expect(w.whiteboardMaps().map((m) => m.id)).toContain(made.id);
    // Never the last map.
    expect(w.deleteWhiteboardMap(made.id)).toBe(true);
    expect(w.deleteWhiteboardMap("tree1")).toBe(false);
  });
});
