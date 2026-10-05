import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXAMPLE_MAP_NAME } from "../domain/example";
import { asMapId, asNodeId } from "../domain/ids";
import { build } from "../domain/testMaps";
import type { NodeId, Point } from "../domain/types";
import { memoryStorage } from "./memoryStorage";
import { loadActiveMapId, loadMap, loadRegistry, saveActiveMapId, saveMap } from "./persistMap";

const PAGE = { width: 900, height: 560 };

/** The store reads localStorage when its module loads, so each test loads a
    fresh copy after setting storage up. */
async function freshStore() {
  vi.resetModules();
  return (await import("./mapStore")).useMapStore;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("map store", () => {
  it("opens the example, waiting for its first tidy, on a first visit", async () => {
    const store = (await freshStore()).getState();
    expect(store.map.name).toBe(EXAMPLE_MAP_NAME);
    expect(Object.keys(store.map.nodes)).toHaveLength(12);
    expect(store.needsTidy).toBe(true);
  });

  it("places every box and sizes the page in one change", async () => {
    const useMapStore = await freshStore();
    const ids = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    const positions = new Map<NodeId, Point>(ids.map((id, i) => [id, { x: 100 + i, y: 50 }]));
    useMapStore.getState().placeAll(positions, { width: 1200, height: 700 });

    const { map, needsTidy } = useMapStore.getState();
    expect(needsTidy).toBe(false);
    expect(map.page).toEqual({ width: 1200, height: 700 });
    expect(map.nodes[ids[3]]).toMatchObject({ x: 103, y: 50 });
  });

  it("asks the canvas for a tidy without touching the map", async () => {
    const useMapStore = await freshStore();
    const before = useMapStore.getState().map;
    useMapStore.getState().requestTidy();
    expect(useMapStore.getState().tidyRequest).toEqual({ count: 1, direction: "TB", arrowLength: 47, gesture: null });
    expect(useMapStore.getState().map).toBe(before);
    useMapStore.getState().requestTidy({ direction: "LR" });
    expect(useMapStore.getState().tidyRequest).toEqual({ count: 2, direction: "LR", arrowLength: 47, gesture: null });
    useMapStore.getState().requestTidy({ arrowLength: 103 });
    expect(useMapStore.getState().tidyRequest).toEqual({ count: 3, direction: "TB", arrowLength: 103, gesture: null });
    expect(useMapStore.getState().map).toBe(before);
  });

  it("switches direction and arrow length and moves the boxes as one undo step", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().placeAll(new Map(), { width: 1200, height: 700 });
    const before = useMapStore.getState().map;
    const id = Object.keys(before.nodes)[0] as NodeId;
    useMapStore.getState().placeAll(new Map([[id, { x: 5, y: 6 }]]), undefined, { direction: "LR", arrowLength: 15 });
    const after = useMapStore.getState().map;
    expect(after).toMatchObject({ direction: "LR", arrowLength: 15 });
    expect(after.nodes[id]).toMatchObject({ x: 5, y: 6 });
    expect(after.page).toBe(before.page);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toMatchObject({ direction: "TB", arrowLength: 47 });
    expect(useMapStore.getState().map.nodes[id]).toEqual(before.nodes[id]);
  });

  it("makes one undo step of a dragged or scrolled arrow length", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().placeAll(new Map(), { width: 1200, height: 700 });
    const settings = (arrowLength: number) => ({ direction: "TB" as const, arrowLength });
    for (const length of [55, 63, 71]) useMapStore.getState().placeAll(new Map(), undefined, settings(length), "g1");
    useMapStore.getState().placeAll(new Map(), undefined, settings(90), "g2");
    expect(useMapStore.getState().map.arrowLength).toBe(90);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.arrowLength).toBe(71);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.arrowLength).toBe(47);
  });

  it("keeps a requested arrow length within range", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().requestTidy({ arrowLength: 5000 }, "g");
    expect(useMapStore.getState().tidyRequest).toMatchObject({ arrowLength: 240, gesture: "g" });
  });

  it("adds a box ready for typing, and drops it if left without a name", async () => {
    const useMapStore = await freshStore();
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    expect(useMapStore.getState().editing).toEqual({ kind: "box", id });
    expect(useMapStore.getState().map.nodes[id]).toMatchObject({ name: "", x: 300, y: 200 });

    useMapStore.getState().stopEditing();
    expect(useMapStore.getState().map.nodes[id]).toBeUndefined();
    expect(useMapStore.getState().editing).toBeNull();
  });

  it("never leaves a nameless box behind when another box is added", async () => {
    const useMapStore = await freshStore();
    const first = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().addBox({ x: 500, y: 200 });
    expect(useMapStore.getState().map.nodes[first]).toBeUndefined();
  });

  it("keeps a named box when typing ends, and never blanks a name", async () => {
    const useMapStore = await freshStore();
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().renameBox(id, "  Printer  ");
    useMapStore.getState().stopEditing();
    useMapStore.getState().renameBox(id, "   ");
    expect(useMapStore.getState().map.nodes[id]?.name).toBe("Printer");
  });

  it("connects only where the rules allow", async () => {
    const useMapStore = await freshStore();
    const [a, b] = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    const before = Object.keys(useMapStore.getState().map.links).length;
    expect(useMapStore.getState().connect(a, a)).toBe(false);
    expect(useMapStore.getState().connect(b, a)).toBe(true);
    expect(useMapStore.getState().connect(b, a)).toBe(false);
    expect(Object.keys(useMapStore.getState().map.links)).toHaveLength(before + 1);
  });

  it("forgets the selection and the open label when what they point at is deleted", async () => {
    const useMapStore = await freshStore();
    const map = useMapStore.getState().map;
    const link = Object.values(map.links)[0];
    useMapStore.getState().select(link.from);
    useMapStore.getState().startEditing({ kind: "link", id: link.id });
    useMapStore.getState().deleteBox(link.from);

    const s = useMapStore.getState();
    expect(s.selected).toBeNull();
    expect(s.editing).toBeNull();
    expect(s.map.links[link.id]).toBeUndefined();
  });

  it("does not make the example's first tidy undoable", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().placeAll(new Map(), { width: 1200, height: 700 });
    expect(useMapStore.getState().history.past).toHaveLength(0);
  });

  it("undoes a whole drag in one step, and redoes it", async () => {
    const useMapStore = await freshStore();
    const [a] = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    const start = useMapStore.getState().map;
    useMapStore.getState().moveBox(a, { x: 10, y: 10 }, "drag:1");
    useMapStore.getState().moveBox(a, { x: 20, y: 20 }, "drag:1");
    useMapStore.getState().moveBox(a, { x: 30, y: 30 }, "drag:2");
    expect(useMapStore.getState().history.past).toHaveLength(2);

    useMapStore.getState().undo();
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(start);
    useMapStore.getState().redo();
    expect(useMapStore.getState().map.nodes[a]).toMatchObject({ x: 20, y: 20 });
  });

  it("undoes adding and naming a box in one step; a later rename is its own", async () => {
    const useMapStore = await freshStore();
    const start = useMapStore.getState().map;
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().renameBox(id, "Printer");
    useMapStore.getState().stopEditing();
    useMapStore.getState().renameBox(id, "Scanner");
    expect(useMapStore.getState().history.past).toHaveLength(2);

    useMapStore.getState().undo();
    expect(useMapStore.getState().map.nodes[id]?.name).toBe("Printer");
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(start);
  });

  it("leaves no undo step for a box added and left without a name", async () => {
    const useMapStore = await freshStore();
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().stopEditing();
    expect(useMapStore.getState().map.nodes[id]).toBeUndefined();
    expect(useMapStore.getState().history).toEqual({ past: [], future: [] });
  });

  it("finishes typing before undoing, so a nameless new box can never come back", async () => {
    const useMapStore = await freshStore();
    const [a] = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    useMapStore.getState().setBoxColor(a, "red");
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.nodes[id]).toBeUndefined();
    expect(useMapStore.getState().map.nodes[a].color).toBe("red");
    useMapStore.getState().redo();
    expect(useMapStore.getState().map.nodes[id]).toBeUndefined();
  });

  it("folds a nudge back onto the page into the change that caused it", async () => {
    const useMapStore = await freshStore();
    const [a] = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    const start = useMapStore.getState().map;
    useMapStore.getState().renameBox(a, "A much longer name");
    useMapStore.getState().nudgeBoxes(new Map([[a, { x: 5, y: 5 }]]));
    expect(useMapStore.getState().history.past).toHaveLength(1);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(start);
  });

  it("colours a box, undoably, and lets go of a selection that undo removes", async () => {
    const useMapStore = await freshStore();
    const [a] = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    useMapStore.getState().setBoxColor(a, "blue");
    expect(useMapStore.getState().map.nodes[a].color).toBe("blue");
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.nodes[a].color).toBeNull();

    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().renameBox(id, "New");
    useMapStore.getState().stopEditing();
    useMapStore.getState().select(id);
    useMapStore.getState().undo();
    expect(useMapStore.getState().selected).toBeNull();
  });

  it("reopens the map that was open last, already placed", async () => {
    const saved = build(["a", "b"], [["a", "b"]]);
    saveMap(saved);
    saveActiveMapId(saved.id);
    const store = (await freshStore()).getState();
    expect(store.map).toEqual(saved);
    expect(store.needsTidy).toBe(false);
  });
});

describe("several maps", () => {
  /** A store opened on a saved, placed map named "First". */
  async function storeWithOneMap() {
    const first = { ...build(["a", "b"], [["a", "b"]]), id: asMapId("first"), name: "First" };
    saveMap(first);
    saveActiveMapId(first.id);
    // The auto-saver is what writes edits; it listens on the page for "tab
    // closing" events, so the test gives it a stand-in page.
    const page = { addEventListener: () => {}, innerWidth: 1200 };
    vi.stubGlobal("window", page);
    vi.stubGlobal("document", page);
    const useMapStore = await freshStore();
    (await import("./autoSave")).initAutoSave();
    return { useMapStore, first };
  }

  it("starts a blank map, saved and listed straight away", async () => {
    const { useMapStore } = await storeWithOneMap();
    useMapStore.getState().newMap();
    const s = useMapStore.getState();
    expect(s.map.name).toBe("Untitled map");
    expect(s.map.nodes).toEqual({});
    expect(s.maps.map((m) => m.name)).toEqual(["First", "Untitled map"]);
    expect(loadRegistry()).toEqual(s.maps);
    expect(loadActiveMapId()).toBe(s.map.id);
  });

  it("saves the outgoing map's last edit before switching, and keeps each map's undo", async () => {
    const { useMapStore, first } = await storeWithOneMap();
    useMapStore.getState().setBoxColor(asNodeId("a"), "red");
    useMapStore.getState().newMap();
    expect(loadMap(first.id, PAGE)?.nodes[asNodeId("a")].color).toBe("red");
    expect(useMapStore.getState().history.past).toHaveLength(0);

    useMapStore.getState().switchMap(first.id);
    expect(useMapStore.getState().map.nodes[asNodeId("a")].color).toBe("red");
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.nodes[asNodeId("a")].color).toBeNull();
  });

  it("finishes typing before switching, so a nameless box is not carried away", async () => {
    const { useMapStore, first } = await storeWithOneMap();
    useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().newMap();
    expect(Object.keys(loadMap(first.id, PAGE)!.nodes)).toEqual(["a", "b"]);
    expect(useMapStore.getState().editing).toBeNull();
  });

  it("duplicates the open map under a copy's name", async () => {
    const { useMapStore, first } = await storeWithOneMap();
    useMapStore.getState().duplicateMap();
    const s = useMapStore.getState();
    expect(s.map.id).not.toBe(first.id);
    expect(s.map.name).toBe("First (copy)");
    expect(s.map.nodes).toEqual(first.nodes);
    expect(s.maps.map((m) => m.name)).toEqual(["First", "First (copy)"]);
  });

  it("adds a fresh example, waiting for its tidy, without touching the others", async () => {
    const { useMapStore, first } = await storeWithOneMap();
    useMapStore.getState().addExampleMap();
    const s = useMapStore.getState();
    expect(s.map.name).toBe(EXAMPLE_MAP_NAME);
    expect(s.needsTidy).toBe(true);
    expect(s.maps.map((m) => m.id)).toEqual([first.id, s.map.id]);
    expect(loadMap(first.id, PAGE)).toEqual(first);
  });

  it("renames the open map in the list, without an undo step", async () => {
    const { useMapStore } = await storeWithOneMap();
    useMapStore.getState().renameMap("  Home   network ");
    const s = useMapStore.getState();
    expect(s.map.name).toBe("Home network");
    expect(s.maps[0].name).toBe("Home network");
    expect(s.history.past).toHaveLength(0);
    useMapStore.getState().renameMap("   ");
    expect(useMapStore.getState().map.name).toBe("Home network");
  });

  it("deletes the open map for good and opens the newest one left, never the last map", async () => {
    const { useMapStore, first } = await storeWithOneMap();
    useMapStore.getState().deleteMap(first.id);
    expect(useMapStore.getState().map.id).toBe(first.id);

    useMapStore.getState().newMap();
    const second = useMapStore.getState().map.id;
    useMapStore.getState().newMap();
    useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().deleteMap(useMapStore.getState().map.id);
    const s = useMapStore.getState();
    expect(s.map.id).toBe(second);
    expect(s.maps.map((m) => m.id)).toEqual([first.id, second]);
    expect(loadRegistry()).toEqual(s.maps);

    useMapStore.getState().deleteMap(first.id);
    expect(useMapStore.getState().maps.map((m) => m.id)).toEqual([second]);
    expect(loadMap(first.id, PAGE)).toBeNull();
  });

  it("drops a map from the list when it can no longer be read", async () => {
    const { useMapStore } = await storeWithOneMap();
    useMapStore.getState().newMap();
    const id = useMapStore.getState().map.id;
    useMapStore.getState().switchMap(asMapId("first"));
    localStorage.setItem(`linkkit:map:${id}`, "{not json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    useMapStore.getState().switchMap(id);
    expect(useMapStore.getState().map.id).toBe("first");
    expect(useMapStore.getState().maps.map((m) => m.id)).toEqual(["first"]);
  });
});

describe("map store (tree)", () => {
  /** A fresh store with the example tree open and tidied. */
  async function treeStore() {
    const useMapStore = await freshStore();
    useMapStore.getState().addExampleTree();
    useMapStore.getState().placeAll(new Map(), PAGE);
    return useMapStore;
  }
  const named = (useMapStore: Awaited<ReturnType<typeof freshStore>>, name: string) =>
    Object.values(useMapStore.getState().map.nodes).find((n) => n.name === name)!.id;

  it("starts a new tree with its start box's name open once it is shown", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().newTree();
    const { map, needsTidy, editing } = useMapStore.getState();
    expect(map.kind).toBe("tree");
    expect(Object.values(map.nodes).map((n) => n.name)).toEqual(["Start"]);
    expect(needsTidy).toBe(true);
    expect(editing).toBeNull();
    useMapStore.getState().placeAll(new Map(), PAGE);
    expect(useMapStore.getState().editing).toEqual({ kind: "box", id: Object.keys(map.nodes)[0] });
  });

  it("adds a next step with its arrow, named, as one undo step, and asks for room", async () => {
    const useMapStore = await treeStore();
    const before = useMapStore.getState().map;
    const settle = useMapStore.getState().settleRequest;
    const no = named(useMapStore, "No, stay");
    const id = useMapStore.getState().addNextStep(no)!;
    useMapStore.getState().renameBox(id, "Stay put");
    useMapStore.getState().stopEditing();
    const { map, settleRequest } = useMapStore.getState();
    expect(Object.values(map.links).some((l) => l.from === no && l.to === id)).toBe(true);
    expect(settleRequest).toBe(settle + 2);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(before);
  });

  it("drops a next step left without a name, arrow and all", async () => {
    const useMapStore = await treeStore();
    const before = useMapStore.getState().map;
    useMapStore.getState().addNextStep(named(useMapStore, "No, stay"));
    useMapStore.getState().stopEditing();
    expect(useMapStore.getState().map).toEqual(before);
  });

  it("asks before deleting a branch, then deletes it as one undo step", async () => {
    const useMapStore = await treeStore();
    const before = useMapStore.getState().map;
    const yes = named(useMapStore, "Yes, take it");
    useMapStore.getState().deleteBox(yes);
    expect(useMapStore.getState().confirmingDelete).toEqual({ id: yes, count: 6 });
    expect(useMapStore.getState().map).toBe(before);
    useMapStore.getState().confirmDelete();
    expect(Object.keys(useMapStore.getState().map.nodes)).toHaveLength(3);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(before);
  });

  it("deletes a lone box at once, and never the start", async () => {
    const useMapStore = await treeStore();
    useMapStore.getState().deleteBox(named(useMapStore, "Walk to work"));
    expect(useMapStore.getState().confirmingDelete).toBeNull();
    expect(Object.keys(useMapStore.getState().map.nodes)).toHaveLength(8);
    const before = useMapStore.getState().map;
    useMapStore.getState().deleteBox(named(useMapStore, "Take the new job?"));
    expect(useMapStore.getState().map).toBe(before);
    expect(useMapStore.getState().confirmingDelete).toBeNull();
  });
});
