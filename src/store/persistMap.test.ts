import { beforeEach, describe, expect, it, vi } from "vitest";

import { asMapId } from "../domain/ids";
import { serializeMap } from "../domain/persistence";
import { build } from "../domain/testMaps";
import { memoryStorage } from "./memoryStorage";
import { deleteStoredMap, loadActiveMapId, loadMap, loadRegistry, saveActiveMapId, saveMap } from "./persistMap";
import { useSaveHealth } from "./saveHealth";

const PAGE = { width: 900, height: 560 };

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("map storage", () => {
  it("reads back what it saved, and which map was open", () => {
    const map = build(["a", "b"], [["a", "b", "uses"]]);
    saveMap(map);
    saveActiveMapId(map.id);
    expect(loadActiveMapId()).toBe(map.id);
    expect(loadMap(map.id, PAGE)).toEqual(map);
  });

  it("returns null for a map that is not there", () => {
    expect(loadMap(asMapId("nope"), PAGE)).toBeNull();
  });

  it("sets a damaged map aside before handing back the repair", () => {
    const map = build(["a"]);
    const data = serializeMap(map) as unknown as { map: { name: number } };
    data.map.name = 42;
    localStorage.setItem(`linkkit:map:${map.id}`, JSON.stringify(data));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(loadMap(map.id, PAGE)?.name).toBe("Untitled map");
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    expect(keys.filter((k) => k?.startsWith(`linkkit:damaged:${map.id}:`))).toHaveLength(1);
  });

  it("keeps unreadable text aside too, and opens nothing", () => {
    localStorage.setItem("linkkit:map:x", "{not json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadMap(asMapId("x"), PAGE)).toBeNull();
    expect(localStorage.length).toBe(2);
  });

  it("lists every saved map, keeping names in step and forgetting deleted ones", () => {
    const one = { ...build(["a"]), id: asMapId("one"), name: "One" };
    const two = { ...build(["b"]), id: asMapId("two"), name: "Two" };
    saveMap(one);
    saveMap(two);
    saveMap({ ...one, name: "First" });
    expect(loadRegistry()).toEqual([{ id: "one", name: "First" }, { id: "two", name: "Two" }]);
    deleteStoredMap(one.id);
    expect(loadRegistry()).toEqual([{ id: "two", name: "Two" }]);
    expect(loadMap(one.id, PAGE)).toBeNull();
  });

  it("rebuilds the list from the stored maps (a save from before the list existed)", () => {
    const old = { ...build(["a"]), id: asMapId("old"), name: "Old map" };
    localStorage.setItem("linkkit:map:old", JSON.stringify(serializeMap(old)));
    localStorage.setItem("linkkit:map:bad", "{not json");
    localStorage.setItem("linkkit:registry", JSON.stringify({ version: 1, maps: [{ id: "gone", name: "Gone" }] }));
    expect(loadRegistry()).toEqual([{ id: "old", name: "Old map" }, { id: "bad", name: "Damaged map" }]);
  });
});

describe("when storage is full", () => {
  /** A storage that refuses new writes once `full` is set, like a browser
      over its quota. */
  function fillable() {
    const storage = memoryStorage();
    const state = { full: false };
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (k, v) => {
      if (state.full) throw new DOMException("full", "QuotaExceededError");
      setItem(k, v);
    };
    vi.stubGlobal("localStorage", storage);
    return state;
  }

  beforeEach(() => useSaveHealth.setState({ failing: [] }));

  it("reports the failed save, and clears it once that save goes through", () => {
    const storage = fillable();
    const map = build(["a"]);
    storage.full = true;
    saveMap(map);
    expect(useSaveHealth.getState().failing).toContain(`linkkit:map:${map.id}`);

    storage.full = false;
    saveMap(map);
    expect(useSaveHealth.getState().failing).toEqual([]);
  });

  it("a small write that fits doesn't hide the map that didn't", () => {
    const storage = fillable();
    const map = build(["a"]);
    storage.full = true;
    saveMap(map);
    storage.full = false;
    saveActiveMapId(map.id);
    expect(useSaveHealth.getState().failing).toContain(`linkkit:map:${map.id}`);
  });

  it("stops reporting a map that was deleted", () => {
    const storage = fillable();
    const map = build(["a"]);
    storage.full = true;
    saveMap(map);
    storage.full = false;
    deleteStoredMap(map.id);
    expect(useSaveHealth.getState().failing).toEqual([]);
  });

  it("doesn't claim a damaged map's original was kept when it wasn't", () => {
    const storage = fillable();
    const map = build(["a"]);
    const data = serializeMap(map) as unknown as { map: { name: number } };
    data.map.name = 42;
    localStorage.setItem(`linkkit:map:${map.id}`, JSON.stringify(data));
    storage.full = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    loadMap(map.id, PAGE);
    expect(warn.mock.calls[0][0]).toContain("could NOT be kept aside");
    // The one-off copy is not retried, so it must not hold the banner up.
    expect(useSaveHealth.getState().failing).toEqual([]);
  });
});
