import { asLinkId, asMapId, asNodeId } from "./ids";
import { addLink, addNode, createMap } from "./map";
import { normalizeOrder } from "./order";
import type { LinkMap, NodeId, StepType } from "./types";

/**
 * Test helper: builds a map from short names, e.g.
 * `build(["a", "b"], [["a", "b"]])` -- box ids are the names, so tests can
 * refer to them directly. Arrow ids are "from>to".
 */
export function build(names: string[], arrows: [string, string, string?][] = []): LinkMap {
  let map = createMap(asMapId("m1"), "Test", { width: 800, height: 600 });
  for (const name of names) map = addNode(map, { x: 0, y: 0 }, name, asNodeId(name)).map;
  for (const [from, to, label] of arrows) {
    const added = addLink(map, asNodeId(from), asNodeId(to), label, asLinkId(`${from}>${to}`));
    if (added.linkId === null) throw new Error(`arrow ${from}>${to} refused`);
    map = added.map;
  }
  return map;
}

export const ids = (...names: string[]): NodeId[] => names.map(asNodeId);

/**
 * Test helper: a tree from short names. `start` is the start box; arrows
 * are added straight into the map (not through `canLink`), so a test can
 * also build a damaged tree. Arrow ids are "from>to".
 */
export function buildTree(start: string, names: string[], arrows: [string, string, string?][] = []): LinkMap {
  let map: LinkMap = { ...build([start, ...names]), kind: "tree" };
  for (const [from, to, label] of arrows) {
    const id = asLinkId(`${from}>${to}`);
    map = { ...map, links: { ...map.links, [id]: { id, from: asNodeId(from), to: asNodeId(to), label: label ?? "" } } };
  }
  // The sibling order a tree grown through the real edits would have.
  return { ...map, order: normalizeOrder(map) };
}

/** Test helper: a Steps map from short names (ids are the names), with
    step types, built as `buildTree` builds a tree. */
export function buildSteps(
  start: string,
  names: string[],
  arrows: [string, string, string?][],
  types: Record<string, Exclude<StepType, "step">> = {},
): LinkMap {
  const tree = buildTree(start, names, arrows);
  const nodes = { ...tree.nodes };
  for (const [name, type] of Object.entries(types)) nodes[asNodeId(name)] = { ...nodes[asNodeId(name)], stepType: type };
  return { ...tree, kind: "steps", nodes };
}
