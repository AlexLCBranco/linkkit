import { describe, expect, it } from "vitest";

import { exampleMap, EXAMPLE_MAP_NAME, exampleTree } from "./example";
import { readMap, serializeMap, serializeStored } from "./persistence";
import { BACKUP_FORMAT, BACKUP_VERSION, readBackup } from "./backup";
import { duplicateMap } from "./map";
import type { MapId } from "./types";
import { build, buildTree } from "./testMaps";

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
    expect(readMap({ ...saved, map: { ...saved.map, kind: "flowchart" } }, fallbackPage).status).toBe("unreadable");
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

  it("keeps the arrow length, reads older saves (none, or a preset's name), repairs a bad one", () => {
    const map = { ...build(["a"]), arrowLength: 70 };
    expect(readMap(roundTrip(serializeMap(map)), fallbackPage)).toEqual({ status: "ok", map });
    const old = roundTrip(serializeMap(map));
    delete old.map.arrowLength;
    expect(readMap(old, fallbackPage)).toMatchObject({ status: "ok", map: { arrowLength: 47 } });
    old.map.arrowLength = "long";
    expect(readMap(old, fallbackPage)).toMatchObject({ status: "ok", map: { arrowLength: 103 } });
    old.map.arrowLength = "huge";
    expect(readMap(old, fallbackPage)).toMatchObject({ status: "repaired", map: { arrowLength: 47 }, fixes: 1 });
    old.map.arrowLength = 9000;
    expect(readMap(old, fallbackPage)).toMatchObject({ status: "repaired", map: { arrowLength: 240 }, fixes: 1 });
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

describe("readMap (tree)", () => {
  it("reads back a tree exactly, arrows without labels included", () => {
    const map = exampleTree({ width: 900, height: 560 });
    expect(Object.values(map.links).every((l) => l.label === "")).toBe(true);
    expect(readMap(roundTrip(serializeMap(map)), fallbackPage)).toEqual({ status: "ok", map });
  });
});

describe("readMap (damaged tree)", () => {
  it("repairs a tree's shape as it opens, keeping every box", () => {
    // Two starts ("job" and "other"), and a loop yes -> no -> yes.
    const map = buildTree("job", ["yes", "no", "other"], [["job", "yes"], ["yes", "no"], ["no", "yes"]]);
    const read = readMap(roundTrip(serializeMap(map)), fallbackPage);
    expect(read.status).toBe("repaired");
    if (read.status !== "repaired") return;
    expect(read.fixes).toBe(2);
    expect(Object.keys(read.map.nodes)).toEqual(Object.keys(map.nodes));
    expect(Object.values(read.map.links).map((l) => `${l.from}>${l.to}`).sort()).toEqual([
      "job>other",
      "job>yes",
      "yes>no",
    ]);
    expect(read.map.order).toEqual({ job: ["yes", "other"], yes: ["no"] });
    // Read again, it is whole.
    expect(readMap(roundTrip(serializeMap(read.map)), fallbackPage)).toEqual({ status: "ok", map: read.map });
  });
});

describe("linked trees", () => {
  const linked = { ...buildTree("s", ["a"], [["s", "a"]]), linkedBoard: "s" };

  it("are stored as version 2 with their board, other maps as version 1", () => {
    const stored = roundTrip(serializeStored(linked, 3));
    expect(stored).toMatchObject({ version: 2, rev: 3, map: { linkedBoard: "s" } });
    expect(readMap(stored, fallbackPage)).toEqual({ status: "ok", map: linked });
    expect(roundTrip(serializeStored(build(["a"]), 3))).toMatchObject({ version: 1, rev: 3 });
  });

  it("are exported, duplicated and restored from a file as ordinary trees", () => {
    expect(roundTrip(serializeMap(linked)).map.linkedBoard).toBeUndefined();
    expect(duplicateMap(linked, "m2" as MapId, "Copy").linkedBoard).toBeUndefined();
    const file = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: "", maps: [roundTrip(serializeStored(linked, 1))] };
    const read = readBackup(file, fallbackPage);
    expect(read.status === "ok" && read.maps.length === 1 && !("linkedBoard" in read.maps[0])).toBe(true);
  });

  it("call version 2 unreadable unless it is a tree with a board", () => {
    const stored = roundTrip(serializeStored(linked, 1));
    expect(readMap({ ...stored, map: { ...stored.map, linkedBoard: "" } }, fallbackPage).status).toBe("unreadable");
    expect(readMap({ ...stored, map: { ...stored.map, kind: "connections" } }, fallbackPage).status).toBe("unreadable");
  });
});
