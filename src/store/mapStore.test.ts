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

  it("reopens the map that was open last, already placed", async () => {
    const saved = build(["a", "b"], [["a", "b"]]);
    saveMap(saved);
    saveActiveMapId(saved.id);
    const store = (await freshStore()).getState();
    expect(store.map).toEqual(saved);
    expect(store.needsTidy).toBe(false);
  });
});
