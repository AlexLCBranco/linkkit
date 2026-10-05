import { describe, expect, it } from "vitest";

import { exampleMap, EXAMPLE_MAP_NAME } from "./example";
import { readMap, serializeMap } from "./persistence";
import { build } from "./testMaps";

const fallbackPage = { width: 980, height: 560 };

/** A JSON round trip, like a real save and load. */
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("readMap", () => {
  it("reads back exactly what was saved", () => {
    const map = exampleMap({ width: 900, height: 560 });
    expect(readMap(roundTrip(serializeMap(map)), fallbackPage)).toEqual({ status: "ok", map });
  });

  it("saves only the content fields", () => {
    const map = { ...build(["a"]), extra: "leak" };
    expect(roundTrip(serializeMap(map)).map.extra).toBeUndefined();
  });

  it("rejects data with nothing to salvage, or from an unknown version or kind", () => {
    const saved = roundTrip(serializeMap(build(["a"])));
    expect(readMap(null, fallbackPage).status).toBe("unreadable");
    expect(readMap({ ...saved, version: 2 }, fallbackPage).status).toBe("unreadable");
    expect(readMap({ ...saved, map: { ...saved.map, kind: "tree" } }, fallbackPage).status).toBe("unreadable");
    expect(readMap({ ...saved, map: { ...saved.map, id: 7 } }, fallbackPage).status).toBe("unreadable");
  });

  it("keeps the direction, reads an older save (none) as top-down, repairs a bad one", () => {
    const map = { ...build(["a"]), direction: "LR" as const };
    expect(readMap(roundTrip(serializeMap(map)), fallbackPage)).toEqual({ status: "ok", map });
    const old = roundTrip(serializeMap(map));
    delete old.map.direction;
    expect(readMap(old, fallbackPage)).toMatchObject({ status: "ok", map: { direction: "TB" } });
    old.map.direction = "sideways";
    expect(readMap(old, fallbackPage)).toMatchObject({ status: "repaired", map: { direction: "TB" }, fixes: 1 });
  });

  it("keeps the arrow length, reads an older save (none) as medium, repairs a bad one", () => {
    const map = { ...build(["a"]), arrowLength: "long" as const };
    expect(readMap(roundTrip(serializeMap(map)), fallbackPage)).toEqual({ status: "ok", map });
    const old = roundTrip(serializeMap(map));
    delete old.map.arrowLength;
    expect(readMap(old, fallbackPage)).toMatchObject({ status: "ok", map: { arrowLength: "medium" } });
    old.map.arrowLength = "huge";
    expect(readMap(old, fallbackPage)).toMatchObject({ status: "repaired", map: { arrowLength: "medium" }, fixes: 1 });
  });

  it("repairs bad fields and drops arrows the rules would refuse", () => {
    const data = roundTrip(serializeMap(build(["a", "b"], [["a", "b"]])));
    data.map.name = "";
    data.map.page = { width: -5, height: "tall" };
    data.map.nodes.a.x = null;
    data.map.nodes.a.color = "neon";
    data.map.nodes.b.name = 42;
    data.map.links["a>b"].label = "";
    data.map.links.ghost = { id: "ghost", from: "a", to: "nobody", label: "needs" };
    data.map.links.self = { id: "self", from: "a", to: "a", label: "needs" };
    data.map.links.again = { id: "again", from: "a", to: "b", label: "needs" };

    const read = readMap(data, fallbackPage);
    expect(read.status).toBe("repaired");
    if (read.status !== "repaired") return;
    expect(read.map.name).toBe("Untitled map");
    expect(read.map.page).toEqual(fallbackPage);
    expect(read.map.nodes["a" as never]).toMatchObject({ x: 0, color: null });
    expect(read.map.nodes["b" as never]).toMatchObject({ name: "" });
    expect(Object.keys(read.map.links)).toEqual(["a>b"]);
    expect(read.map.links["a>b" as never].label).toBe("needs");
    expect(read.fixes).toBe(9);
  });
});

describe("exampleMap", () => {
  it("is the Microsoft 365 sign-in map, with fresh ids each time", () => {
    const one = exampleMap(fallbackPage);
    const two = exampleMap(fallbackPage);
    expect(one.name).toBe(EXAMPLE_MAP_NAME);
    expect(Object.keys(one.nodes)).toHaveLength(12);
    expect(Object.keys(one.links)).toHaveLength(12);
    expect(Object.keys(one.nodes)).not.toEqual(Object.keys(two.nodes));
    expect(Object.values(one.links).filter((l) => l.label !== "needs").map((l) => l.label)).toEqual([
      "checked by",
      "comes from",
      "requires",
      "managed by",
    ]);
  });
});
