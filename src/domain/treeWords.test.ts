import { describe, expect, it } from "vitest";

import { layoutMap } from "./layout";
import { branchOf, startOf } from "./tree";
import { exampleTree } from "./treeWords";
import type { NodeId } from "./types";

const named = (map: ReturnType<typeof exampleTree>, ids: Iterable<NodeId>) =>
  [...ids].map((id) => map.nodes[id].name).sort();

describe("the tree words example", () => {
  const map = exampleTree();
  const byName = (name: string) => Object.values(map.nodes).find((n) => n.name === name)!.id;
  const children = (name: string) =>
    named(
      map,
      Object.values(map.links)
        .filter((l) => l.from === byName(name))
        .map((l) => l.to),
    );

  it("is Trip -> Lisbon, Porto; Lisbon -> Hotel, Food, as the dialog says", () => {
    expect(map.kind).toBe("tree");
    expect(map.arrowStyle).toBe("elbow");
    expect(map.nodes[startOf(map)!].name).toBe("Trip");
    expect(children("Trip")).toEqual(["Lisbon", "Porto"]);
    expect(children("Lisbon")).toEqual(["Food", "Hotel"]);
    expect(named(map, branchOf(map, byName("Lisbon")))).toEqual(["Food", "Hotel", "Lisbon"]);
  });

  it("lays out with Lisbon left of Porto and Hotel left of Food", () => {
    const { positions } = layoutMap(map, new Map(), { columnGap: 32, rowGap: 64, fallbackSize: { width: 80, height: 36 } });
    const at = (name: string) => positions.get(byName(name))!;
    expect(at("Trip").y).toBeLessThan(at("Lisbon").y);
    expect(at("Lisbon").x).toBeLessThan(at("Porto").x);
    expect(at("Hotel").x).toBeLessThan(at("Food").x);
  });
});
