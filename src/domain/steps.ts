import { createLinkId, createNodeId } from "./ids";
import { addNode, createMap, deleteNodes, renameNode } from "./map";
import { nextSteps, withNextStep } from "./order";
import { walk } from "./reach";
import { canAddNextStep, canDeleteBox, isBranching, parentsOf } from "./rules";
import { trashEntryOf, withTrashEntry } from "./trash";
import { startOf } from "./tree";
import type { Link, LinkId, LinkMap, MapId, NodeId, Size, StepType } from "./types";

/**
 * Steps (flowchart mode): an ordered process that can branch and join, on
 * the same boxes and arrows as every map. The rules live in rules.ts
 * (`steps`); this file holds what only Steps needs, all pure:
 *
 *  - `stepNumbers`: every step's number, worked out, never typed;
 *  - `addNext` / `addBranch`: the "Add next" menu's edits;
 *  - `deleteStep`: deleting a step closes the gap instead of cutting the
 *    process in two;
 *  - `createSteps`: a new Steps map from a preset.
 *
 * A step's type (`MapNode.stepType`) says how it goes on: a plain step has
 * at most one next step; Yes / No, Choice and Parallel split into branches
 * (each branch's first arrow labelled); End has nothing after it. A join is
 * not a type: it is any step with two parents.
 */

export const stepTypeOf = (map: LinkMap, id: NodeId): StepType => map.nodes[id]?.stepType ?? "step";

/** How many branches a split starts with, and their arrows' labels
    (editable afterwards like any label). */
export const BRANCH_LABELS: Readonly<Record<"yesno" | "choice" | "parallel", readonly string[]>> = {
  yesno: ["Yes", "No"],
  choice: ["Option A", "Option B", "Option C"],
  parallel: ["", ""],
};

/** The branch letters: a … z, then aa, ab … (as spreadsheet columns). */
export function branchLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(97 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/* ---- Numbering ---- */

/** One split a step sits inside: which split, which of its branches, and
    where the split itself sits on the path around it. */
export interface Frame {
  readonly split: NodeId;
  /** The branch's letter; "" for an arrow from the split straight into a
      join (no branch of its own). */
  readonly letter: string;
  /** The split's own index on its path. */
  readonly splitIndex: number;
  /** The branch's number prefix ("3a"). */
  readonly prefix: string;
}

/** Where a step sits: on the path `prefix` (the main path is ""), at
    `index`, inside the splits `frames` (outermost first). */
export interface Place {
  readonly prefix: string;
  readonly index: number;
  readonly frames: readonly Frame[];
}

/** Which path a place is on, as a key: "" for the main path, and one
    "split:letter" per split it sits inside ("n3:a/n7:b"). Steps with the
    same key are one straight run, ordered by `index`. */
export const pathKey = (frames: readonly Frame[]): string => frames.map((f) => `${f.split}:${f.letter}`).join("/");

const numberOf = (place: Place): string => (place.prefix ? `${place.prefix}.${place.index}` : `${place.index}`);

/** Whether a step splits into branches: by its type, or (damaged data)
    by having more than one next step. */
export const splits = (map: LinkMap, id: NodeId): boolean => isBranching(map, id) || nextSteps(map, id).length > 1;

/** A split's branches: its next steps that have no other parent (an arrow
    straight into a join is not a branch, and takes no letter). */
export const branchStarts = (map: LinkMap, split: NodeId): NodeId[] =>
  nextSteps(map, split).filter((c) => parentsOf(map, c).length === 1);

/**
 * Every step's place, worked out in one pass from the start, each step
 * after all its parents:
 *
 *  - after a plain step: the same path, one further (2 after 1);
 *  - a split's branches start paths of their own, lettered in sibling
 *    order: under step 3, branch a is 3a.1, 3a.2 …, branch b 3b.1 …;
 *  - a join (two or more parents) goes back to the path where its parents
 *    part, one after the furthest of them there: branches split at 3 join
 *    at 4, whatever their lengths.
 *
 * Steps not reached from the start (damaged data) have no place.
 */
export function stepPlaces(map: LinkMap): Map<NodeId, Place> {
  const places = new Map<NodeId, Place>();
  const start = startOf(map);
  if (!start) return places;
  const reached = new Set([start, ...walk(map, start, "forward")]);
  const waiting = new Map<NodeId, number>();
  for (const id of reached) waiting.set(id, parentsOf(map, id).filter((p) => reached.has(p)).length);

  // The splits a parent hands on to `child`: its own, plus its split's
  // frame when it splits.
  const handed = (parent: NodeId, child: NodeId): readonly Frame[] => {
    const at = places.get(parent)!;
    if (!splits(map, parent)) return at.frames;
    const branch = branchStarts(map, parent).indexOf(child);
    const letter = branch === -1 ? "" : branchLetter(branch);
    return [...at.frames, { split: parent, letter, splitIndex: at.index, prefix: `${numberOf(at)}${letter}` }];
  };

  places.set(start, { prefix: "", index: 1, frames: [] });
  const queue: NodeId[] = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const child of nextSteps(map, queue[i])) {
      const left = waiting.get(child)! - 1;
      waiting.set(child, left);
      if (left > 0) continue;
      const parents = parentsOf(map, child).filter((p) => places.has(p));
      const incoming = parents.map((p) => handed(p, child));
      // How deep the parents' splits agree: the path they part on.
      let depth = 0;
      const same = (a: Frame, b: Frame) => a.split === b.split && a.letter === b.letter;
      while (incoming.every((f) => f.length > depth && same(f[depth], incoming[0][depth]))) depth++;
      const frames = incoming[0].slice(0, depth);
      const prefix = depth === 0 ? "" : frames[depth - 1].prefix;
      // Each parent's furthest point on that path: the split it left it by,
      // itself when it is on it, or nothing when the path starts with it.
      const reach = parents.map((p, k) => {
        if (incoming[k].length > depth) return incoming[k][depth].splitIndex;
        const own = places.get(p)!;
        return own.frames.length === depth ? own.index : 0;
      });
      places.set(child, { prefix, index: Math.max(...reach) + 1, frames });
      queue.push(child);
    }
  }
  return places;
}

/** Every step's number ("1", "3a.2", "4"), worked out from the arrows and
    the sibling order, so it changes the moment a step is added, moved or
    deleted. */
export function stepNumbers(map: LinkMap): Map<NodeId, string> {
  const out = new Map<NodeId, string>();
  for (const [id, place] of stepPlaces(map)) out.set(id, numberOf(place));
  return out;
}

/* ---- Editing ---- */

/** How far below its step a new step first appears; the canvas re-tidies. */
const NEW_STEP_DROP = 100;
const BRANCH_SPREAD = 160;

const withType = (map: LinkMap, id: NodeId, type: StepType): LinkMap => {
  const node = map.nodes[id];
  if (!node) return map;
  const { stepType: _, ...plain } = node;
  return { ...map, nodes: { ...map.nodes, [id]: type === "step" ? plain : { ...plain, stepType: type } } };
};

const linkBetween = (map: LinkMap, from: NodeId, to: NodeId): Link | undefined =>
  Object.values(map.links).find((l) => l.from === from && l.to === to);

/**
 * The "Add next" menu on step `at`:
 *
 *  - "step" / "end": a new step right after `at`. If `at` already went on,
 *    the new step goes in between (the rest of the process follows it);
 *    an End only goes after the last step of a path;
 *  - "yesno" / "choice" / "parallel": `at` becomes the split, with its
 *    branches (2, 3 or 2 new steps; arrows labelled as `BRANCH_LABELS`).
 *    If `at` already went on, every branch joins back into what came next.
 *
 * Returns the new steps in order, or `null` when `at` can't go on that
 * way (an End, an existing split: use `addBranch`, a missing step).
 */
export function addNext(
  map: LinkMap,
  at: NodeId,
  type: StepType,
  newNodeId: () => NodeId = createNodeId,
  newLinkId: () => LinkId = createLinkId,
): { map: LinkMap; nodeIds: NodeId[] } | null {
  const node = map.nodes[at];
  if (!node || map.kind !== "steps" || !canAddNextStep(map, at) || splits(map, at)) return null;
  const old = nextSteps(map, at)[0] ?? null;
  const oldLink = old ? linkBetween(map, at, old)! : null;
  if (type === "end" && old) return null;

  if (type === "step" || type === "end") {
    const id = newNodeId();
    let next = addNode(map, { x: node.x, y: node.y + NEW_STEP_DROP }, "", id).map;
    if (type === "end") next = withType(next, id, "end");
    const linkId = newLinkId();
    const links: Record<LinkId, Link> = { ...next.links, [linkId]: { id: linkId, from: at, to: id, label: "" } };
    const order: Record<NodeId, readonly NodeId[]> = { ...next.order, [at]: [id] };
    if (oldLink && old) {
      links[oldLink.id] = { ...oldLink, from: id };
      order[id] = [old];
    }
    return { map: { ...next, links, order }, nodeIds: [id] };
  }

  const labels = BRANCH_LABELS[type];
  let next = withType(map, at, type);
  const links: Record<LinkId, Link> = { ...next.links };
  const order: Record<NodeId, readonly NodeId[]> = { ...next.order };
  if (oldLink) delete links[oldLink.id];
  const nodeIds: NodeId[] = [];
  labels.forEach((label, i) => {
    const id = newNodeId();
    const x = node.x + (i - (labels.length - 1) / 2) * BRANCH_SPREAD;
    next = addNode(next, { x, y: node.y + NEW_STEP_DROP }, "", id).map;
    const linkId = newLinkId();
    links[linkId] = { id: linkId, from: at, to: id, label };
    if (old) {
      const joinId = newLinkId();
      links[joinId] = { id: joinId, from: id, to: old, label: "" };
      order[id] = [old];
    }
    nodeIds.push(id);
  });
  order[at] = nodeIds;
  return { map: { ...next, links, order }, nodeIds };
}

/** What a step's "+" offers: the "Add next" menu (a step that may go on
    and doesn't split yet), "branch" (one more branch on a Choice or
    Parallel), or nothing (an End, a Yes / No: its two branches are its
    way on). */
export function addNextOffer(map: LinkMap, id: NodeId): "menu" | "branch" | null {
  if (map.kind !== "steps" || !map.nodes[id] || !canAddNextStep(map, id)) return null;
  const type = stepTypeOf(map, id);
  if (type === "choice" || type === "parallel") return "branch";
  return splits(map, id) ? null : "menu";
}

/** Why "Add next" can't add a `type` step after `at`, in words; `null`
    when it can (or `at` is gone). For the hint when it is tried anyway. */
export function addNextRefusal(map: LinkMap, at: NodeId, type: StepType): string | null {
  const node = map.nodes[at];
  if (!node || map.kind !== "steps") return null;
  const name = `“${node.name || "Untitled"}”`;
  if (!canAddNextStep(map, at)) return `${name} is an End step: nothing comes after it.`;
  if (splits(map, at)) {
    const kind = stepTypeOf(map, at);
    return kind === "choice" || kind === "parallel"
      ? `${name} already splits: use + to add a branch, or add steps inside its branches.`
      : `${name} is a Yes / No question: add steps inside its two branches.`;
  }
  if (type === "end" && nextSteps(map, at).length > 0) return `${name} already goes on: an End only goes after the last step.`;
  return null;
}

/** One more branch on a Choice ("Option D" …) or a Parallel split, last
    in order and not yet joined. `null` for Yes / No (two branches only) or
    anything that isn't such a split. */
export function addBranch(
  map: LinkMap,
  at: NodeId,
  newNodeId: () => NodeId = createNodeId,
  newLinkId: () => LinkId = createLinkId,
): { map: LinkMap; nodeId: NodeId } | null {
  const node = map.nodes[at];
  const type = stepTypeOf(map, at);
  if (!node || map.kind !== "steps" || (type !== "choice" && type !== "parallel")) return null;
  const count = nextSteps(map, at).length;
  const id = newNodeId();
  const added = addNode(map, { x: node.x + count * BRANCH_SPREAD, y: node.y + NEW_STEP_DROP }, "", id).map;
  const linkId = newLinkId();
  const label = type === "choice" ? `Option ${branchLetter(count).toUpperCase()}` : "";
  const links = { ...added.links, [linkId]: { id: linkId, from: at, to: id, label } };
  return { map: { ...added, links, order: withNextStep(added.order, at, id) }, nodeId: id };
}

/**
 * Deletes a step and closes the gap, so the process never falls apart:
 *
 *  - a plain step or an End: each arrow into it now leads to what came
 *    after it (keeping its label, so a "No" branch stays "No"). Deleting a
 *    join leaves both branches leading to the step after it, or ending
 *    where they are;
 *  - a split: it goes with every step inside its branches, and the steps
 *    before it lead on to where the branches joined (if they did).
 *
 * Any step left unreachable (only possible in damaged data) goes too, so
 * no loose box is left. The start can't be deleted (rules.ts). The same
 * map when nothing can go.
 */
export function deleteStep(map: LinkMap, id: NodeId): LinkMap {
  if (map.kind !== "steps" || !canDeleteBox(map, id)) return map;
  const gone = new Set<NodeId>([id]);
  let goesTo: NodeId | null;
  if (splits(map, id)) {
    const places = stepPlaces(map);
    const own = places.get(id);
    goesTo = null;
    for (const [box, place] of places) {
      if (place.frames.some((f) => f.split === id)) gone.add(box);
      else if (
        own &&
        place.prefix === own.prefix &&
        place.index === own.index + 1 &&
        place.frames.length === own.frames.length
      ) {
        goesTo = box;
      }
    }
  } else {
    goesTo = nextSteps(map, id)[0] ?? null;
  }

  // The arrows into the step lead on instead (same id and label), each
  // in the step's place among its parent's next steps.
  const links: Record<LinkId, Link> = { ...map.links };
  const order: Record<NodeId, readonly NodeId[]> = { ...map.order };
  for (const parent of parentsOf(map, id)) {
    if (gone.has(parent)) continue;
    const into = linkBetween(map, parent, id)!;
    const list = nextSteps(map, parent);
    if (goesTo && !linkBetween(map, parent, goesTo)) {
      links[into.id] = { ...into, to: goesTo };
      order[parent] = list.map((c) => (c === id ? goesTo! : c));
    } else {
      delete links[into.id];
      order[parent] = list.filter((c) => c !== id);
    }
  }
  let next = deleteNodes({ ...map, links, order }, gone);

  // Nothing loose: whatever can no longer be reached from the start goes.
  const start = startOf(next);
  if (start) {
    const reached = new Set([start, ...walk(next, start, "forward")]);
    const loose = Object.keys(next.nodes).filter((n) => !reached.has(n as NodeId)) as NodeId[];
    if (loose.length) next = deleteNodes(next, loose);
  }
  return next;
}

/**
 * Deletes several steps the Steps way (`deleteStep`, one after another),
 * returning the map and every step that went: the ones asked for, plus
 * those that went with them (a split's branches). Steps that can't go
 * (the start) are skipped.
 */
export function deleteSteps(map: LinkMap, ids: Iterable<NodeId>): { map: LinkMap; gone: Set<NodeId> } {
  let next = map;
  for (const id of ids) next = deleteStep(next, id);
  const gone = new Set((Object.keys(map.nodes) as NodeId[]).filter((id) => !next.nodes[id]));
  return { map: next, gone };
}

/**
 * `deleteSteps`, with what went kept in the trash as one entry, read from
 * the map as it was: the steps, every arrow that touched them, and their
 * places. The arrows that were led on keep their ids, so a restore puts
 * them back as they were (`restoreFromTrash`). The same map when nothing
 * can go.
 */
export function trashSteps(map: LinkMap, ids: Iterable<NodeId>, deletedAt: number): LinkMap {
  const { map: next, gone } = deleteSteps(map, ids);
  return gone.size === 0 ? map : withTrashEntry(next, trashEntryOf(map, gone, deletedAt));
}

/* ---- New maps ---- */

/** The presets a new Steps map can start from. */
export const STEP_PRESETS = ["blank", "decision", "check"] as const;
export type StepPreset = (typeof STEP_PRESETS)[number];

/**
 * A new Steps map, drawn as trees are (Elbow lines, Treekit's text):
 *
 *  - "blank": one empty step;
 *  - "decision": a Yes / No question with an End on each side;
 *  - "check": two steps, then a Yes / No check, an End on each side
 *    (the "No" side can loop back once loops exist: not in this version).
 */
export function createSteps(
  id: MapId,
  name: string,
  page: Size,
  preset: StepPreset = "blank",
  newNodeId: () => NodeId = createNodeId,
  newLinkId: () => LinkId = createLinkId,
): { map: LinkMap; startId: NodeId } {
  const blank: LinkMap = { ...createMap(id, name, page, "steps"), arrowStyle: "elbow", labelStyle: "treekit" };
  const startId = newNodeId();
  let map = addNode(blank, { x: 0, y: 0 }, "", startId).map;
  const step = (at: NodeId, type: StepType, names: string[]): NodeId[] => {
    const added = addNext(map, at, type, newNodeId, newLinkId)!;
    map = added.map;
    added.nodeIds.forEach((n, i) => (map = renameNode(map, n, names[i] ?? "")));
    return added.nodeIds;
  };
  const yesNoEnds = (question: NodeId, yes: string, no: string) => {
    for (const end of step(question, "yesno", [yes, no])) map = withType(map, end, "end");
  };
  if (preset === "decision") {
    map = renameNode(map, startId, "Is it ready?");
    yesNoEnds(startId, "Go ahead", "Stop");
  } else if (preset === "check") {
    map = renameNode(map, startId, "Get the request");
    const [work] = step(startId, "step", ["Do the work"]);
    const [check] = step(work, "step", ["Is it right?"]);
    yesNoEnds(check, "Done", "Fix it");
  }
  return { map, startId };
}
