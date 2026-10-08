import { describe, expect, it } from "vitest";

import { asMapId } from "./ids";
import { readMap, serializeMap } from "./persistence";
import { build, buildTree } from "./testMaps";
import {
  BUILT_IN_TEMPLATES,
  builtInMap,
  freeTemplateName,
  readTemplates,
  savedMap,
  serializeTemplates,
  templateName,
  templateOf,
  withFreshIds,
} from "./templates";
import { startOf } from "./tree";

const PAGE = { width: 800, height: 600 };

describe("built-in templates", () => {
  it("each makes a map that loads without repair, one box per outline line", () => {
    expect(BUILT_IN_TEMPLATES.slice(0, 2).map((t) => t.id)).toEqual(["example-signin", "example-job"]);
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    for (const template of BUILT_IN_TEMPLATES) {
      const map = builtInMap(template, PAGE);
      expect(map.kind).toBe(template.kind);
      expect(map.name).toBe(template.name);
      expect(readMap(JSON.parse(JSON.stringify(serializeMap(map))), PAGE).status, template.id).toBe("ok");
      if (template.outline) expect(Object.keys(map.nodes)).toHaveLength(template.outline.split("\n").length);
      if (map.kind === "tree") expect(startOf(map)).not.toBeNull();
    }
  });

  it("makes fresh ids every time", () => {
    const [template] = BUILT_IN_TEMPLATES;
    const a = builtInMap(template, PAGE);
    const b = builtInMap(template, PAGE);
    expect(a.id).not.toBe(b.id);
    expect(Object.keys(a.nodes).some((id) => b.nodes[id as keyof typeof b.nodes])).toBe(false);
  });
});

describe("saved templates", () => {
  const tree = { ...buildTree("s", ["a", "b"], [["s", "a", "if yes"], ["s", "b"]]), name: "Mine", collapsed: [] };

  it("saves a map without its trash or link, and starts a fresh copy from it", () => {
    const saved = templateOf({ ...tree, linkedBoard: "board" }, "t1", 5);
    expect(saved.map.map).not.toHaveProperty("linkedBoard");
    const map = savedMap(saved, PAGE, asMapId("new"))!;
    expect(map.id).toBe("new");
    expect(map.name).toBe("Mine");
    expect(Object.values(map.nodes).map((n) => n.name).sort()).toEqual(["a", "b", "s"]);
    expect(Object.keys(map.nodes).some((id) => ["s", "a", "b"].includes(id))).toBe(false);
    expect(Object.values(map.links).map((l) => l.label).sort()).toEqual(["", "if yes"]);
    expect(readMap(JSON.parse(JSON.stringify(serializeMap(map))), PAGE).status).toBe("ok");
  });

  it("an untitled map's template is named after its start (or first) box", () => {
    expect(templateOf({ ...tree, name: "Untitled map" }, "t", 0).name).toBe("s");
    expect(templateOf({ ...build(["x", "y"]), name: "Untitled map 2" }, "t", 0).name).toBe("x");
    expect(templateOf(tree, "t", 0).name).toBe("Mine");
  });

  it("reads back what was stored, skipping what isn't whole", () => {
    const saved = templateOf(tree, "t1", 5);
    const stored = JSON.parse(JSON.stringify(serializeTemplates([saved, { ...saved, id: "" }])));
    expect(readTemplates(stored)).toEqual([saved]);
    expect(readTemplates({ version: 9, templates: [] })).toEqual([]);
    expect(readTemplates(null)).toEqual([]);
  });

  it("withFreshIds keeps the shape: the order and collapse follow the new ids", () => {
    const fresh = withFreshIds({ ...tree, collapsed: tree.collapsed }, asMapId("x"), "X");
    const start = startOf(fresh)!;
    expect(fresh.order[start]).toHaveLength(2);
    expect(fresh.trash).toEqual([]);
  });
});

describe("template names (U13)", () => {
  const mine = (id: string, name: string) => templateOf({ ...buildTree("s", []), name }, id, 0);

  it("suggests the map's name, or its start (or first) box's while untitled", () => {
    expect(templateName({ ...buildTree("s", []), name: "Party" })).toBe("Party");
    expect(templateName({ ...buildTree("s", []), name: "Untitled map 4" })).toBe("s");
  });

  it("numbers a name another template has, built in or saved, but not the one renamed", () => {
    const saved = [mine("a", "Party"), mine("b", "Party 2")];
    expect(freeTemplateName("  Party  ", saved)).toBe("Party 3");
    expect(freeTemplateName("Five whys", saved)).toBe("Five whys 2");
    expect(freeTemplateName("Party", saved, "a")).toBe("Party");
    expect(freeTemplateName("   ", saved)).toBe("");
  });
});
