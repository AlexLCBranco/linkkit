import { describe, expect, it } from "vitest";

import { asLinkId, asNodeId } from "./ids";
import { renameMap, setCollapsed, setLinkLabel, setNodeColor, setNodeNotes, setNodesStatus } from "./map";
import { fromMermaid, toMermaid } from "./mermaid";
import { nextSteps } from "./order";
import { readMap, serializeMap } from "./persistence";
import { build, buildTree } from "./testMaps";
import { startOf } from "./tree";
import type { LinkMap, NodeId } from "./types";

const PAGE = { width: 800, height: 600 };
const id = asNodeId;

function imported(text: string, taken: string[] = []) {
  const result = fromMermaid(text, PAGE, taken);
  if (!result.ok) throw new Error(result.error);
  return result;
}
const only = (text: string) => {
  const { maps } = imported(text);
  expect(maps).toHaveLength(1);
  return maps[0];
};
const byName = (map: LinkMap, name: string) => Object.values(map.nodes).find((n) => n.name === name)!;
const names = (map: LinkMap, ids: readonly NodeId[]) => ids.map((n) => map.nodes[n].name);
/** Every arrow as "from -> to (label)", sorted. */
const arrows = (map: LinkMap) =>
  Object.values(map.links)
    .map((l) => `${map.nodes[l.from].name} -> ${map.nodes[l.to].name}${l.label ? ` (${l.label})` : ""}`)
    .sort();

/** What Treekit v0.x writes for a small tree (its `toMermaid`). */
const TREEKIT = `flowchart LR
    n1["Move?"]
    n2["Rent"]
    n3["Buy"]
    n4["Two lines<br/>here"]
    n1 -->|"if cheap"| n2
    n1 --> n3
    n3 --> n4
    style n2 fill:#c2ebde,stroke:#0ca678
    %% notes n3 "Check the #quot;mortgage#quot;<br/>  rates first"
    classDef cut opacity:0.45,stroke-dasharray:6 4
    class n3 cut
`;

describe("Mermaid import", () => {
  it("reads Treekit's export: names, labels, colours, notes, statuses, direction", () => {
    const map = only(TREEKIT);
    expect(map.kind).toBe("tree");
    expect(map.direction).toBe("LR");
    expect(map.name).toBe("Move?");
    const start = startOf(map)!;
    expect(map.nodes[start].name).toBe("Move?");
    expect(names(map, nextSteps(map, start))).toEqual(["Rent", "Buy"]);
    expect(arrows(map)).toEqual(["Buy -> Two lines\nhere", "Move? -> Buy", "Move? -> Rent (if cheap)"]);
    expect(byName(map, "Rent").color).toBe("teal");
    expect(byName(map, "Buy").notes).toBe('Check the "mortgage"\n  rates first');
    expect(byName(map, "Buy").status).toBe("cut");
  });

  it("gives a fresh map that saves and reads back with nothing to repair", () => {
    const map = only(TREEKIT);
    expect(readMap(JSON.parse(JSON.stringify(serializeMap(map))), PAGE).status).toBe("ok");
  });

  it("opens each separate tree as its own map (one tree per map)", () => {
    const { maps } = imported("flowchart TD\n  a[One] --> b[Two]\n  c[Three] --> d[Four]\n  e[Alone]");
    expect(maps.map((m) => [m.kind, m.name, Object.keys(m.nodes).length])).toEqual([
      ["tree", "One", 2],
      ["tree", "Three", 2],
      ["tree", "Alone", 1],
    ]);
  });

  it("keeps a box with two ways in as a tree (Linkkit trees allow it)", () => {
    const map = only("flowchart TD\n  s --> a & b\n  a --> c\n  b --> c");
    expect(map.kind).toBe("tree");
    expect(Object.values(map.links).filter((l) => l.to === byName(map, "c").id)).toHaveLength(2);
  });

  it("opens what breaks tree rules (a loop, two starts sharing a box) as one map without tree rules", () => {
    const { maps, warnings } = imported(
      "flowchart TD\n  a --> b --> c --> a\n  x --> z\n  y --> z\n  t1 -->|yes| t2\n  b:::cut",
    );
    expect(maps.map((m) => m.kind)).toEqual(["tree", "connections"]);
    const loose = maps[1];
    expect(Object.values(loose.nodes).map((n) => n.name).sort()).toEqual(["a", "b", "c", "x", "y", "z"]);
    // Unlabelled arrows say "needs", as every connections arrow does.
    expect(arrows(loose)).toContain("a -> b (needs)");
    // A map without tree rules has no keep / maybe / cut: said, not lost silently.
    expect(byName(loose, "b").status).toBeNull();
    expect(warnings.join(" ")).toMatch(/Keep \/ maybe \/ cut was left off 1 box/);
    expect(readMap(JSON.parse(JSON.stringify(serializeMap(loose))), PAGE).status).toBe("ok");
  });

  it("leaves out an arrow from a box to itself, and says so", () => {
    const { maps, warnings } = imported("flowchart TD\n  a[Loop] --> a\n  a --> b");
    expect(arrows(maps[0])).toEqual(["Loop -> b"]);
    expect(warnings).toEqual(["“Loop” pointed to itself; that arrow was left out."]);
  });

  it("reads the common flowchart syntax: shapes, chains, & lists, text links, front matter", () => {
    const map = only(`---
title: "My: plan"
---
graph TB
  A((Start)) -- go on --> B{Choice}; B -.-> C([Done])
  B ==> D>Flag] & E[(Store)]`);
    expect(map.name).toBe("My: plan");
    expect(arrows(map)).toEqual(["Choice -> Done", "Choice -> Flag", "Choice -> Store", "Start -> Choice (go on)"]);
  });

  it("names an untitled import after its start box, or the next free untitled name", () => {
    expect(only("flowchart TD\n  a[Rent] --> b").name).toBe("Rent");
    expect(imported('flowchart TD\n  a[" "] --> b', ["Untitled map"]).maps[0].name).toBe("Untitled map 2");
  });

  it("refuses what isn't a flowchart, and subgraphs, saying why", () => {
    expect(fromMermaid("sequenceDiagram\n A->>B: hi", PAGE)).toMatchObject({ ok: false });
    expect(fromMermaid("flowchart TD\n subgraph x\n a --> b\n end", PAGE)).toEqual({
      ok: false,
      error: "Subgraphs aren't supported yet.",
    });
    expect(fromMermaid("flowchart TD\n", PAGE)).toEqual({ ok: false, error: "No boxes found." });
  });
});

describe("Mermaid export", () => {
  function decorated(): LinkMap {
    let map = buildTree("s", ["a", "b", "c"], [["s", "a"], ["s", "b", "if \"no\""], ["b", "c"]]);
    map = renameMap(map, "Big | <choice>");
    map = setNodeColor(map, id("a"), "purple");
    map = setNodeNotes(map, id("c"), "line 1\nline #2");
    map = setNodesStatus(map, [id("b")], "maybe");
    map = setCollapsed(map, [id("b")], true);
    return { ...map, direction: "LR", order: { [id("s")]: [id("b"), id("a")], [id("b")]: [id("c")] } };
  }

  it("writes Treekit's format, every box (folded ones too) in reading order", () => {
    const text = toMermaid(decorated());
    expect(text).toBe(`---
title: "Big | <choice>"
---
flowchart LR
    n1["s"]
    n2["b"]
    n3["c"]
    n4["a"]
    n1 -->|"if #quot;no#quot;"| n2
    n1 --> n4
    n2 --> n3
    style n4 fill:#e9d3ef,stroke:#9c36b5
    %% notes n3 "line 1<br/>line #35;2"
    classDef maybe stroke-dasharray:3 3
    class n2 maybe
`);
  });

  it("round-trips a tree: names, labels, order, colours, notes, statuses, direction and the map's name", () => {
    const source = decorated();
    const back = only(toMermaid(source));
    expect(back.kind).toBe("tree");
    expect(back.name).toBe("Big | <choice>");
    expect(back.direction).toBe("LR");
    expect(names(back, nextSteps(back, startOf(back)!))).toEqual(["b", "a"]);
    expect(arrows(back)).toEqual(arrows(source));
    for (const name of ["s", "a", "b", "c"]) {
      const was = byName(source, name);
      expect(byName(back, name)).toMatchObject({ color: was.color, status: was.status });
      expect(byName(back, name).notes ?? "").toBe(was.notes ?? "");
    }
  });

  it("round-trips a connections map as one map without tree rules, loops and loose boxes included", () => {
    let source = build(["x", "y", "z", "lone"], [["x", "y"], ["y", "z"], ["z", "y", "feeds"]]);
    source = setLinkLabel(source, asLinkId("x>y"), "uses");
    const text = toMermaid(source);
    expect(text).toContain("%% linkkit connections");
    expect(text).toContain(`title: "Test"`);
    const back = only(text);
    expect(back.kind).toBe("connections");
    expect(arrows(back)).toEqual(arrows(source));
    expect(Object.keys(back.nodes)).toHaveLength(4);
  });
});
