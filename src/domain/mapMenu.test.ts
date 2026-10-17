import { describe, expect, it } from "vitest";

import { mapMenuList } from "./mapMenu";

const maps = Array.from({ length: 11 }, (_, i) => ({ id: `m${i}`, name: i === 3 ? "Party plan" : `Map ${i}` }));

describe("mapMenuList", () => {
  it("lists the 8 newest, the rest under All maps", () => {
    const { shown, more } = mapMenuList(maps, "");
    expect(shown.map((m) => m.id)).toEqual(["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7"]);
    expect(more.map((m) => m.id)).toEqual(["m8", "m9", "m10"]);
  });

  it("has nothing under All maps when there are 8 or fewer", () => {
    expect(mapMenuList(maps.slice(0, 8), "").more).toEqual([]);
  });

  it("searches every map, any case, ignoring spaces at the ends", () => {
    expect(mapMenuList(maps, "  PARTY ").shown.map((m) => m.id)).toEqual(["m3"]);
    expect(mapMenuList(maps, "map 1").shown.map((m) => m.id)).toEqual(["m1", "m10"]);
    expect(mapMenuList(maps, "map 1").more).toEqual([]);
  });

  it("finds nothing for a name no map has", () => {
    expect(mapMenuList(maps, "zzz")).toEqual({ shown: [], more: [] });
  });

  it("a blank search is no search", () => {
    expect(mapMenuList(maps, "   ").shown).toHaveLength(8);
  });
});
