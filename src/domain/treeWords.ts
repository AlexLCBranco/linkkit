import { asMapId, asNodeId } from "./ids";
import { addNextStep, createTree } from "./tree";
import type { LinkMap, NodeId } from "./types";

/**
 * The little tree the shortcuts dialog draws to explain the tree words
 * (start box, parent, child, sibling, branch): Trip leads to Lisbon and
 * Porto; Lisbon leads to Hotel and Food. Built with the same functions as
 * any tree, so it is laid out and drawn like a real one.
 */
export function exampleTree(): LinkMap {
  const id = (name: string): NodeId => asNodeId(`example-${name.toLowerCase()}`);
  let { map } = createTree(asMapId("tree-words"), "Trip", { width: 0, height: 0 }, "Trip", id("Trip"));
  for (const [parent, child] of [
    ["Trip", "Lisbon"],
    ["Trip", "Porto"],
    ["Lisbon", "Hotel"],
    ["Lisbon", "Food"],
  ]) {
    map = addNextStep(map, id(parent), { x: 0, y: 0 }, child, id(child))!.map;
  }
  return map;
}
