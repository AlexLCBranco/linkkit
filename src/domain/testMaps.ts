import { asLinkId, asMapId, asNodeId } from "./ids";
import { addLink, addNode, createMap } from "./map";
import type { LinkMap, NodeId } from "./types";

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
