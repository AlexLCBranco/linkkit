import { createMapId } from "./ids";
import { addLink, addNode, createMap } from "./map";
import { addNextStep, createTree } from "./tree";
import type { LinkMap, MapId, NodeId, Size } from "./types";

/**
 * The example map new users see: what a Microsoft 365 sign-in depends on
 * (from the prototype). Every call makes fresh ids, so "Add example map"
 * can add it again and again without clashes. All boxes start at (0, 0);
 * the caller runs Tidy up once the boxes have been measured.
 */
export const EXAMPLE_MAP_NAME = "Microsoft 365 sign-in";

export function exampleMap(page: Size, id: MapId = createMapId()): LinkMap {
  let map = createMap(id, EXAMPLE_MAP_NAME, page);
  const box: Record<string, NodeId> = {};
  const names: [string, string][] = [
    ["outlook", "Outlook"],
    ["teams", "Teams"],
    ["sharepoint", "SharePoint"],
    ["signin", "Microsoft 365 sign-in"],
    ["license", "User license"],
    ["entra", "Entra ID account"],
    ["mfa", "MFA approval"],
    ["ca", "Conditional Access"],
    ["internet", "Internet connection"],
    ["auth", "Authenticator app"],
    ["laptop", "Compliant laptop"],
    ["intune", "Intune enrollment"],
  ];
  for (const [key, name] of names) {
    const added = addNode(map, { x: 0, y: 0 }, name);
    map = added.map;
    box[key] = added.nodeId;
  }
  const arrows: [string, string, string?][] = [
    ["outlook", "signin"],
    ["outlook", "license"],
    ["teams", "signin"],
    ["teams", "license"],
    ["sharepoint", "signin"],
    ["signin", "entra"],
    ["signin", "mfa"],
    ["signin", "ca", "checked by"],
    ["signin", "internet"],
    ["mfa", "auth", "comes from"],
    ["ca", "laptop", "requires"],
    ["laptop", "intune", "managed by"],
  ];
  for (const [from, to, label] of arrows) map = addLink(map, box[from], box[to], label).map;
  return map;
}

/**
 * The example tree ("Add example tree"): a small decision with one merge,
 * where renting and buying both lead to the same "Live near the office"
 * instead of repeating it. Fresh ids every call; boxes start at (0, 0) and
 * the caller tidies them once measured, as for the example map.
 */
export const EXAMPLE_TREE_NAME = "Take the new job?";

export function exampleTree(page: Size, id: MapId = createMapId()): LinkMap {
  const tree = createTree(id, EXAMPLE_TREE_NAME, page, EXAMPLE_TREE_NAME);
  let map = tree.map;
  const box: Record<string, NodeId> = { job: tree.startId };
  const steps: [string, string, string][] = [
    ["job", "yes", "Yes, take it"],
    ["job", "no", "No, stay"],
    ["yes", "rent", "Rent a flat"],
    ["yes", "buy", "Buy a flat"],
    ["rent", "near", "Live near the office"],
    ["buy", "mortgage", "Take out a mortgage"],
    ["near", "walk", "Walk to work"],
    ["no", "raise", "Ask for a raise"],
  ];
  for (const [from, key, name] of steps) {
    const added = addNextStep(map, box[from], { x: 0, y: 0 }, name)!;
    map = added.map;
    box[key] = added.nodeId;
  }
  // The merge: buying leads to the same place as renting.
  return addLink(map, box.buy, box.near).map;
}
