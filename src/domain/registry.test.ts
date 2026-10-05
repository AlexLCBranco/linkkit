import { describe, expect, it } from "vitest";

import { asMapId } from "./ids";
import { copyName, readRegistry, removeMap, serializeRegistry, upsertMap, type Registry } from "./registry";

const a = { id: asMapId("a"), name: "Alpha" };
const b = { id: asMapId("b"), name: "Beta" };

describe("map registry", () => {
  it("round-trips through its saved shape", () => {
    const saved = JSON.parse(JSON.stringify(serializeRegistry([a, b])));
    expect(readRegistry(saved)).toEqual([a, b]);
  });

  it("rejects data that is not a registry, and skips bad entries", () => {
    expect(readRegistry(null)).toBeNull();
    expect(readRegistry({ version: 99, maps: [] })).toBeNull();
    expect(readRegistry({ version: 1, maps: "x" })).toBeNull();
    const read = readRegistry({ version: 1, maps: [a, null, { id: 3 }, { id: "a", name: "Dup" }, { id: "c", name: " " }] });
    expect(read).toEqual([a, { id: "c", name: "Untitled map" }]);
  });

  it("adds at the end, renames in place, and leaves an unchanged list alone", () => {
    const one: Registry = [a];
    const two = upsertMap(one, b);
    expect(two).toEqual([a, b]);
    expect(upsertMap(two, { id: a.id, name: "Alpha 2" })).toEqual([{ id: a.id, name: "Alpha 2" }, b]);
    expect(upsertMap(two, a)).toBe(two);
  });

  it("removes a map, and returns the same list when it was not there", () => {
    const list: Registry = [a, b];
    expect(removeMap(list, a.id)).toEqual([b]);
    expect(removeMap(list, asMapId("zzz"))).toBe(list);
  });

  it("names a copy so it never repeats a name in the list", () => {
    expect(copyName("Alpha", [a])).toBe("Alpha (copy)");
    expect(copyName("Alpha", [a, { id: asMapId("c"), name: "Alpha (copy)" }])).toBe("Alpha (copy 2)");
  });
});
