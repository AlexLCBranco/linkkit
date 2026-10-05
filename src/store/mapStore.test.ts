import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXAMPLE_MAP_NAME } from "../domain/example";
import { build } from "../domain/testMaps";
import type { NodeId, Point } from "../domain/types";
import { memoryStorage } from "./memoryStorage";
import { saveActiveMapId, saveMap } from "./persistMap";

/** The store reads localStorage when its module loads, so each test loads a
    fresh copy after setting storage up. */
async function freshStore() {
  vi.resetModules();
  return (await import("./mapStore")).useMapStore;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("map store", () => {
  it("opens the example, waiting for its first tidy, on a first visit", async () => {
    const store = (await freshStore()).getState();
    expect(store.map.name).toBe(EXAMPLE_MAP_NAME);
    expect(Object.keys(store.map.nodes)).toHaveLength(12);
    expect(store.needsTidy).toBe(true);
  });

  it("places every box and sizes the page in one change", async () => {
    const useMapStore = await freshStore();
    const ids = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    const positions = new Map<NodeId, Point>(ids.map((id, i) => [id, { x: 100 + i, y: 50 }]));
    useMapStore.getState().placeAll(positions, { width: 1200, height: 700 });

    const { map, needsTidy } = useMapStore.getState();
    expect(needsTidy).toBe(false);
    expect(map.page).toEqual({ width: 1200, height: 700 });
    expect(map.nodes[ids[3]]).toMatchObject({ x: 103, y: 50 });
  });

  it("adds a box ready for typing, and drops it if left without a name", async () => {
    const useMapStore = await freshStore();
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    expect(useMapStore.getState().editing).toEqual({ kind: "box", id });
    expect(useMapStore.getState().map.nodes[id]).toMatchObject({ name: "", x: 300, y: 200 });

    useMapStore.getState().stopEditing();
    expect(useMapStore.getState().map.nodes[id]).toBeUndefined();
    expect(useMapStore.getState().editing).toBeNull();
  });

  it("keeps a named box when typing ends, and never blanks a name", async () => {
    const useMapStore = await freshStore();
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().renameBox(id, "  Printer  ");
    useMapStore.getState().stopEditing();
    useMapStore.getState().renameBox(id, "   ");
    expect(useMapStore.getState().map.nodes[id]?.name).toBe("Printer");
  });

  it("connects only where the rules allow", async () => {
    const useMapStore = await freshStore();
    const [a, b] = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    const before = Object.keys(useMapStore.getState().map.links).length;
    expect(useMapStore.getState().connect(a, a)).toBe(false);
    expect(useMapStore.getState().connect(b, a)).toBe(true);
    expect(useMapStore.getState().connect(b, a)).toBe(false);
    expect(Object.keys(useMapStore.getState().map.links)).toHaveLength(before + 1);
  });

  it("forgets the selection and the open label when what they point at is deleted", async () => {
    const useMapStore = await freshStore();
    const map = useMapStore.getState().map;
    const link = Object.values(map.links)[0];
    useMapStore.getState().select(link.from);
    useMapStore.getState().startEditing({ kind: "link", id: link.id });
    useMapStore.getState().deleteBox(link.from);

    const s = useMapStore.getState();
    expect(s.selected).toBeNull();
    expect(s.editing).toBeNull();
    expect(s.map.links[link.id]).toBeUndefined();
  });

  it("reopens the map that was open last, already placed", async () => {
    const saved = build(["a", "b"], [["a", "b"]]);
    saveMap(saved);
    saveActiveMapId(saved.id);
    const store = (await freshStore()).getState();
    expect(store.map).toEqual(saved);
    expect(store.needsTidy).toBe(false);
  });
});
