import { describe, expect, it } from "vitest";

import { mapsToRestore, readBackup, serializeBackup, templatesToRestore } from "./backup";
import { templateOf } from "./templates";
import { exampleTree } from "./example";
import { asMapId } from "./ids";
import { build } from "./testMaps";

const fallbackPage = { width: 980, height: 560 };
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

const mapA = { ...build(["a", "b"], [["a", "b"]]), id: asMapId("A"), name: "Map A" };
const treeB = { ...exampleTree({ width: 900, height: 560 }), id: asMapId("B") };

describe("backup file", () => {
  it("reads back every map, in order, exactly as exported", () => {
    const file = roundTrip(serializeBackup([mapA, treeB], new Date("2026-10-06T12:00:00Z")));
    expect(file.exportedAt).toBe("2026-10-06T12:00:00.000Z");
    expect(readBackup(file, fallbackPage)).toEqual({ status: "ok", maps: [mapA, treeB], damaged: 0, templates: [] });
  });

  it("carries saved templates; an older file without them reads as none", () => {
    const template = templateOf(treeB, "t1", 5);
    const file = roundTrip(serializeBackup([mapA], new Date(), [template]));
    const read = readBackup(file, fallbackPage);
    expect(read.status === "ok" && read.templates).toEqual([template]);
    const { templates: _, ...older } = file;
    const readOlder = readBackup(older, fallbackPage);
    expect(readOlder.status === "ok" && readOlder.templates).toEqual([]);
    expect(templatesToRestore([template], [template, { ...template, id: "t2" }]).map((t) => t.id)).toEqual(["t2"]);
  });

  it("refuses a file that is not a Linkkit backup", () => {
    expect(readBackup(null, fallbackPage).status).toBe("not-a-backup");
    expect(readBackup({ maps: [] }, fallbackPage).status).toBe("not-a-backup");
    expect(readBackup({ format: "boardkit", version: 1, maps: [] }, fallbackPage).status).toBe("not-a-backup");
    const file = roundTrip(serializeBackup([mapA], new Date()));
    expect(readBackup({ ...file, version: 2 }, fallbackPage).status).toBe("not-a-backup");
  });

  it("counts maps it cannot read, and keeps a repeated map once", () => {
    const file = roundTrip(serializeBackup([mapA, mapA], new Date()));
    file.maps.push({ version: 1, map: "garbage" });
    expect(readBackup(file, fallbackPage)).toEqual({ status: "ok", maps: [mapA], damaged: 1, templates: [] });
  });
});

describe("mapsToRestore", () => {
  it("adds only maps not already here, so restoring twice adds nothing", () => {
    expect(mapsToRestore([{ id: mapA.id, name: "renamed since" }], [mapA, treeB])).toEqual({ add: [treeB], alreadyHere: 1 });
    expect(mapsToRestore([mapA, treeB], [mapA, treeB])).toEqual({ add: [], alreadyHere: 2 });
  });
});
