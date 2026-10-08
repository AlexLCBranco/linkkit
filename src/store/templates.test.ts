import { beforeEach, describe, expect, it, vi } from "vitest";

import { templateOf } from "../domain/templates";
import { buildTree } from "../domain/testMaps";
import { memoryStorage } from "./memoryStorage";

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

async function freshTemplates() {
  vi.resetModules();
  return (await import("./templates")).useTemplates;
}

describe("saved templates in the store", () => {
  it("restores the templates from a backup that aren't here, once", async () => {
    const useTemplates = await freshTemplates();
    useTemplates.getState().save({ ...buildTree("s", []), name: "Mine" }, "Mine");
    const [mine] = useTemplates.getState().saved;
    const other = templateOf({ ...buildTree("s", []), name: "From the file" }, "other", 1);
    expect(useTemplates.getState().restore([mine, other])).toBe(1);
    expect(useTemplates.getState().restore([mine, other])).toBe(0);
    expect(useTemplates.getState().saved.map((t) => t.name)).toEqual(["Mine", "From the file"]);
    // Stored, so a reload (or another tab) sees them.
    const again = await freshTemplates();
    expect(again.getState().saved).toHaveLength(2);
  });
});

describe("naming saved templates", () => {
  it("saves under the typed name, numbered if taken; blank uses the suggested name", async () => {
    const useTemplates = await freshTemplates();
    const map = { ...buildTree("s", []), name: "Party" };
    useTemplates.getState().save(map, "Party");
    useTemplates.getState().save(map, "Party");
    useTemplates.getState().save(map, "  ");
    expect(useTemplates.getState().saved.map((t) => t.name)).toEqual(["Party", "Party 2", "Party 3"]);
  });

  it("renames one, numbered if another has the name; blank keeps the old one", async () => {
    const useTemplates = await freshTemplates();
    useTemplates.getState().save({ ...buildTree("s", []), name: "A" }, "A");
    useTemplates.getState().save({ ...buildTree("s", []), name: "B" }, "B");
    const [a, b] = useTemplates.getState().saved;
    useTemplates.getState().rename(b.id, "A");
    useTemplates.getState().rename(a.id, " ");
    expect(useTemplates.getState().saved.map((t) => t.name)).toEqual(["A", "A 2"]);
    const again = await freshTemplates();
    expect(again.getState().saved.map((t) => t.name)).toEqual(["A", "A 2"]);
  });
});
