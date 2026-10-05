import { beforeEach, describe, expect, it, vi } from "vitest";

import { asMapId } from "../domain/ids";
import { serializeMap } from "../domain/persistence";
import { build } from "../domain/testMaps";
import { memoryStorage } from "./memoryStorage";
import { loadActiveMapId, loadMap, saveActiveMapId, saveMap } from "./persistMap";

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
});
