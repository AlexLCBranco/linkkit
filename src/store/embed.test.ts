import { beforeEach, describe, expect, it, vi } from "vitest";

import { readEmbed, readToFrame } from "../domain/embed";
import { asMapId } from "../domain/ids";
import { build } from "../domain/testMaps";
import { memoryStorage } from "./memoryStorage";

/** A fresh store in embed mode for `id` (or the full app, for `null`): the
    store reads the address once, as its module loads. */
async function freshStore(id: string | null) {
  vi.resetModules();
  const embed = await import("./embed");
  embed.setEmbeddedForTests(id === null ? null : { id });
  const persist = await import("./persistMap");
  const { useMapStore } = await import("./mapStore");
  return { useMapStore, embed, persist };
}

/** Every stored key and value, sorted. Read through the Storage API: the
    stand-in's own properties are its methods, not what it holds. */
const storedNow = () =>
  JSON.stringify(
    Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!)
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
  );

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("embed address", () => {
  it("reads ?embed=1&id=…, and nothing else", () => {
    expect(readEmbed("?embed=1&id=abc")).toEqual({ id: "abc" });
    expect(readEmbed("?id=abc&embed=1&x=2")).toEqual({ id: "abc" });
    expect(readEmbed("?embed=1")).toBeNull();
    expect(readEmbed("?embed=1&id=%20")).toBeNull();
    expect(readEmbed("?embed=0&id=abc")).toBeNull();
    expect(readEmbed("")).toBeNull();
  });

  it("takes only the canvas's two messages", () => {
    expect(readToFrame({ type: "stone:flush" })).toEqual({ type: "stone:flush" });
    expect(readToFrame({ type: "stone:scroll-to", x: 4, y: 9 })).toEqual({ type: "stone:scroll-to", x: 4, y: 9 });
    expect(readToFrame({ type: "stone:scroll-to", x: "4", y: 9 })).toBeNull();
    expect(readToFrame({ type: "stone:scroll-to", x: Infinity, y: 9 })).toBeNull();
    expect(readToFrame({ type: "other" })).toBeNull();
    expect(readToFrame("stone:flush")).toBeNull();
  });
});

describe("a frame on the canvas", () => {
  async function twoMaps() {
    vi.resetModules();
    const persist = await import("./persistMap");
    const a = { ...build(["a"]), id: asMapId("A"), name: "Map A" };
    const b = { ...build(["b"]), id: asMapId("B"), name: "Map B" };
    persist.saveMap(a);
    persist.saveMap(b);
    persist.saveActiveMapId(b.id);
    return { a, b };
  }

  it("opens the map its address names, not the one open last, and never changes which that is", async () => {
    const { a } = await twoMaps();
    const { useMapStore, embed, persist } = await freshStore("A");
    expect(useMapStore.getState().map.id).toBe(a.id);
    expect(embed.useEmbedStatus.getState().status).toBe("ok");
    persist.saveActiveMapId(a.id);
    expect(localStorage.getItem("linkkit:active")).toBe("B");
  });

  it("says a map that isn't there is missing, and writes nothing", async () => {
    await twoMaps();
    const before = storedNow();
    const { useMapStore, embed } = await freshStore("nope");
    expect(embed.useEmbedStatus.getState().status).toBe("missing");
    expect(useMapStore.getState().needsTidy).toBe(true);
    expect(storedNow()).toBe(before);
  });

  it("treats a map in the trash as missing", async () => {
    await twoMaps();
    localStorage.setItem("linkkit:trash:maps", JSON.stringify({ version: 1, maps: [{ id: "A", name: "Map A", deletedAt: 1 }] }));
    const { embed } = await freshStore("A");
    expect(embed.useEmbedStatus.getState().status).toBe("missing");
  });

  it("stays on its own map when a restore adds others", async () => {
    await twoMaps();
    const { useMapStore } = await freshStore("A");
    const c = { ...build(["c"]), id: asMapId("C"), name: "Map C" };
    expect(useMapStore.getState().restoreMaps([c]).added).toBe(1);
    expect(useMapStore.getState().map.id).toBe("A");
    expect(useMapStore.getState().maps.map((m) => m.id)).toContain("C");
  });

  it("the full app still opens a restored map", async () => {
    await twoMaps();
    const { useMapStore } = await freshStore(null);
    useMapStore.getState().restoreMaps([{ ...build(["c"]), id: asMapId("C"), name: "Map C" }]);
    expect(useMapStore.getState().map.id).toBe("C");
  });
});
