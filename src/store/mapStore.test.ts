import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXAMPLE_MAP_NAME, exampleMap, exampleTree } from "../domain/example";
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

  it("adds a box ready for typing, keeps it left blank, and takes it back on Esc", async () => {
    const useMapStore = await freshStore();
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    expect(useMapStore.getState().editing).toEqual({ kind: "box", id });
    expect(useMapStore.getState().map.nodes[id]).toMatchObject({ name: "", x: 300, y: 200 });

    useMapStore.getState().stopEditing();
    expect(useMapStore.getState().map.nodes[id]).toMatchObject({ name: "" });
    expect(useMapStore.getState().editing).toBeNull();

    const other = useMapStore.getState().addBox({ x: 500, y: 200 });
    useMapStore.getState().stopEditing(true);
    expect(useMapStore.getState().map.nodes[other]).toBeUndefined();
    expect(useMapStore.getState().history.past).toHaveLength(1);
  });

  it("keeps a blank box when another box is added", async () => {
    const useMapStore = await freshStore();
    const first = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().addBox({ x: 500, y: 200 });
    expect(useMapStore.getState().map.nodes[first]).toMatchObject({ name: "" });
  });

  it("keeps a named box when typing ends, and lets a name be emptied", async () => {
    const useMapStore = await freshStore();
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().renameBox(id, "  Printer  ");
    useMapStore.getState().stopEditing();
    expect(useMapStore.getState().map.nodes[id]?.name).toBe("Printer");
    useMapStore.getState().renameBox(id, "   ");
    expect(useMapStore.getState().map.nodes[id]?.name).toBe("");
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

  it("leaves no undo step for a box added and taken back with Esc", async () => {
    const useMapStore = await freshStore();
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().stopEditing(true);
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
    expect(useMapStore.getState().editing).toBeNull();
    // A blank box is a box: redo brings it back, blank.
    useMapStore.getState().redo();
    expect(useMapStore.getState().map.nodes[id]).toMatchObject({ name: "" });
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

  it("numbers new untitled maps, and a map takes its first box's name until renamed by hand", async () => {
    const { useMapStore } = await storeWithOneMap();
    useMapStore.getState().newMap();
    useMapStore.getState().newTree();
    expect(useMapStore.getState().maps.map((m) => m.name)).toEqual(["First", "Untitled map", "Untitled map 2"]);

    useMapStore.getState().newMap();
    expect(useMapStore.getState().map.name).toBe("Untitled map 3");
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().renameBox(id, "Rent");
    useMapStore.getState().stopEditing();
    expect(useMapStore.getState().map.name).toBe("Rent");
    expect(useMapStore.getState().maps.at(-1)?.name).toBe("Rent");
    // Adding the box and naming it, and the map's name with them, undo in one go.
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.name).toBe("Untitled map 3");
    useMapStore.getState().redo();

    useMapStore.getState().renameMap("Flat hunt");
    useMapStore.getState().renameBox(id, "Rent a flat");
    expect(useMapStore.getState().map.name).toBe("Flat hunt");
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

  it("finishes typing before switching, so a blank box stays in its own map", async () => {
    const { useMapStore, first } = await storeWithOneMap();
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().newMap();
    expect(Object.keys(loadMap(first.id, PAGE)!.nodes)).toEqual(["a", "b", id]);
    expect(useMapStore.getState().map.nodes[id]).toBeUndefined();
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

  it("adds a fresh example from the gallery, waiting for its tidy, without touching the others", async () => {
    const { useMapStore, first } = await storeWithOneMap();
    useMapStore.getState().newFromTemplate(exampleMap(PAGE));
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

  it("moves the open map to the trash and opens the newest one left, never the last map", async () => {
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
    // Kept in the trash: off the list, even after a reload, until erased.
    expect(useMapStore.getState().trashedMaps.map((m) => m.name)).toEqual(["Untitled map 2", "First"]);
    expect(loadMap(first.id, PAGE)).toEqual(first);
    expect(loadRegistry().map((m) => m.id)).toEqual([second]);
    const reloaded = (await freshStore()).getState();
    expect(reloaded.maps.map((m) => m.id)).toEqual([second]);
    expect(reloaded.trashedMaps).toHaveLength(2);
  });

  it("restores a deleted map as the newest, and erases one for good", async () => {
    const { useMapStore, first } = await storeWithOneMap();
    useMapStore.getState().newMap();
    const second = useMapStore.getState().map.id;
    const kept = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().renameBox(kept, "Kept");
    useMapStore.getState().deleteMap(second);
    expect(useMapStore.getState().map.id).toBe(first.id);

    useMapStore.getState().restoreMap(second);
    let s = useMapStore.getState();
    expect(s.map.id).toBe(second);
    expect(Object.values(s.map.nodes).map((n) => n.name)).toEqual(["Kept"]);
    expect(s.maps.map((m) => m.id)).toEqual([first.id, second]);
    expect(s.trashedMaps).toEqual([]);

    useMapStore.getState().deleteMap(second);
    useMapStore.getState().eraseMap(second);
    s = useMapStore.getState();
    expect(s.trashedMaps).toEqual([]);
    expect(loadMap(second, PAGE)).toBeNull();
  });

  it("asks before a map delete would erase the oldest deleted map", async () => {
    const { useMapStore, first } = await storeWithOneMap();
    for (let i = 0; i < 30; i++) {
      useMapStore.getState().newMap();
      useMapStore.getState().deleteMap(useMapStore.getState().map.id);
    }
    const oldest = useMapStore.getState().trashedMaps[0];
    useMapStore.getState().newMap();
    const last = useMapStore.getState().map.id;
    useMapStore.getState().deleteMap(last);
    expect(useMapStore.getState().trashWarning).toMatchObject({ kind: "map", erased: { name: "Untitled map" } });
    expect(useMapStore.getState().map.id).toBe(last);
    useMapStore.getState().confirmTrashWarning();
    const s = useMapStore.getState();
    expect(s.map.id).toBe(first.id);
    expect(s.trashedMaps).toHaveLength(30);
    expect(s.trashedMaps.some((m) => m.id === oldest.id)).toBe(false);
    expect(loadMap(oldest.id, PAGE)).toBeNull();
  });

  it("deletes boxes into the trash, restores them, and undoes both", async () => {
    const { useMapStore } = await storeWithOneMap();
    const before = useMapStore.getState().map;
    useMapStore.getState().deleteBox(asNodeId("a"));
    let s = useMapStore.getState();
    expect(Object.keys(s.map.nodes)).toEqual(["b"]);
    expect(s.map.trash).toHaveLength(1);
    useMapStore.getState().restoreBoxes(asNodeId("a"));
    s = useMapStore.getState();
    expect(s.map.nodes).toEqual(before.nodes);
    expect(s.map.links).toEqual(before.links);
    expect(s.map.trash).toEqual([]);
    expect(s.selected).toBe("a");
    useMapStore.getState().undo();
    expect(Object.keys(useMapStore.getState().map.nodes)).toEqual(["b"]);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(before);
  });

  it("empties the trash: this map's boxes (undoable) and every deleted map", async () => {
    const { useMapStore, first } = await storeWithOneMap();
    useMapStore.getState().newMap();
    const second = useMapStore.getState().map.id;
    useMapStore.getState().deleteMap(second);
    useMapStore.getState().deleteBox(asNodeId("a"));
    useMapStore.getState().emptyTrash();
    const s = useMapStore.getState();
    expect(s.map.id).toBe(first.id);
    expect(s.map.trash).toEqual([]);
    expect(s.trashedMaps).toEqual([]);
    expect(loadMap(second, PAGE)).toBeNull();
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.trash).toHaveLength(1);
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
    useMapStore.getState().newFromTemplate(exampleTree(PAGE));
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

  it("moves a box under another, opening it, in one undo step with the drag, and asks for room", async () => {
    const useMapStore = await treeStore();
    const raise = named(useMapStore, "Ask for a raise");
    const mortgage = named(useMapStore, "Take out a mortgage");
    useMapStore.getState().toggleCollapsed([raise]);
    const before = useMapStore.getState().map;
    const settle = useMapStore.getState().settleRequest;
    useMapStore.getState().moveBoxes(new Map([[mortgage, { x: 5, y: 5 }]]), "drag:t");
    useMapStore.getState().moveToParent(mortgage, raise, null, "drag:t");
    const { map, settleRequest } = useMapStore.getState();
    expect(Object.values(map.links).filter((l) => l.to === mortgage).map((l) => l.from)).toEqual([raise]);
    expect(map.collapsed).not.toContain(raise);
    expect(settleRequest).toBe(settle + 1);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(before);
  });

  it("refuses to move a box into its own branch, saying why", async () => {
    const useMapStore = await treeStore();
    const { useSyncNotice } = await import("./syncNotice");
    const before = useMapStore.getState().map;
    useMapStore.getState().moveToParent(named(useMapStore, "Yes, take it"), named(useMapStore, "Walk to work"), null);
    expect(useMapStore.getState().map).toBe(before);
    expect(useSyncNotice.getState().message?.text).toBe("“Walk to work” is inside the branch you're moving.");
  });

  it("labels a tree arrow and makes room for it, in one undo step with the room", async () => {
    const useMapStore = await treeStore();
    const before = useMapStore.getState().map;
    const settle = useMapStore.getState().settleRequest;
    const link = Object.values(before.links)[0];
    useMapStore.getState().setLinkLabel(link.id, "if yes");
    expect(useMapStore.getState().map.links[link.id].label).toBe("if yes");
    expect(useMapStore.getState().settleRequest).toBe(settle + 1);
    // The canvas's re-tidy joins the label's step.
    useMapStore.getState().nudgeBoxes(new Map([[link.to, { x: 999, y: 999 }]]));
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(before);
    // Emptied, the label goes away again; unchanged, nothing re-tidies.
    useMapStore.getState().redo();
    useMapStore.getState().setLinkLabel(link.id, "  ");
    expect(useMapStore.getState().map.links[link.id].label).toBe("");
    const now = useMapStore.getState().settleRequest;
    useMapStore.getState().setLinkLabel(link.id, "");
    expect(useMapStore.getState().settleRequest).toBe(now);
  });

  it("marks keep / maybe / cut as one undo step each, never on the start", async () => {
    const useMapStore = await treeStore();
    const before = useMapStore.getState().map;
    const yes = named(useMapStore, "Yes, take it");
    const start = named(useMapStore, "Take the new job?");
    useMapStore.getState().setBoxesStatus([yes, start], "maybe");
    expect(useMapStore.getState().map.nodes[yes].status).toBe("maybe");
    expect(useMapStore.getState().map.nodes[start].status).toBeNull();
    // X: cuts, then uncuts once all are cut.
    useMapStore.getState().toggleCut([yes]);
    expect(useMapStore.getState().map.nodes[yes].status).toBe("cut");
    useMapStore.getState().toggleCut([yes]);
    expect(useMapStore.getState().map.nodes[yes].status).toBeNull();
    useMapStore.getState().undo();
    useMapStore.getState().undo();
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(before);
  });

  it("hides cut boxes: lets go of them and asks the tree to close the gap", async () => {
    const useMapStore = await treeStore();
    const yes = named(useMapStore, "Yes, take it");
    const buy = named(useMapStore, "Buy a flat");
    useMapStore.getState().select(buy);
    useMapStore.getState().setBoxesStatus([yes], "cut");
    const settle = useMapStore.getState().settleRequest;
    // Shown greyed out: nothing leaves the page, nothing re-tidies.
    expect(useMapStore.getState().selected).toBe(buy);
    useMapStore.getState().setHideCut(true);
    expect(useMapStore.getState().map.hideCut).toBe(true);
    expect(useMapStore.getState().selected).toBeNull();
    expect(useMapStore.getState().settleRequest).toBe(settle + 1);
    useMapStore.getState().selectAll();
    expect(useMapStore.getState().group).not.toContain(buy);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.hideCut).toBe(false);
  });

  it("collapses a branch, lets go of what it hides, and opens it to add a step", async () => {
    const useMapStore = await treeStore();
    const yes = named(useMapStore, "Yes, take it");
    const rent = named(useMapStore, "Rent a flat");
    useMapStore.getState().select(rent);
    const settle = useMapStore.getState().settleRequest;
    useMapStore.getState().toggleCollapsed([yes]);
    expect(useMapStore.getState().map.collapsed).toEqual([yes]);
    expect(useMapStore.getState().selected).toBeNull();
    expect(useMapStore.getState().settleRequest).toBe(settle + 1);
    useMapStore.getState().addNextStep(yes);
    useMapStore.getState().stopEditing(true);
    // Taken back with Esc, the step is dropped, and so is the opening.
    expect(useMapStore.getState().map.collapsed).toEqual([yes]);
    const id = useMapStore.getState().addNextStep(yes)!;
    expect(useMapStore.getState().map.collapsed).toEqual([]);
    useMapStore.getState().renameBox(id, "Ask a friend");
    useMapStore.getState().stopEditing();
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.collapsed).toEqual([yes]);
  });

  it("keeps a next step left blank, and drops one taken back with Esc, arrow and all", async () => {
    const useMapStore = await treeStore();
    const before = useMapStore.getState().map;
    const no = named(useMapStore, "No, stay");
    useMapStore.getState().addNextStep(no);
    useMapStore.getState().stopEditing(true);
    expect(useMapStore.getState().map).toEqual(before);
    const id = useMapStore.getState().addNextStep(no)!;
    useMapStore.getState().stopEditing();
    expect(useMapStore.getState().map.nodes[id]).toMatchObject({ name: "" });
    expect(Object.values(useMapStore.getState().map.links).some((l) => l.from === no && l.to === id)).toBe(true);
  });

  it("asks before deleting a branch, then deletes it as one undo step", async () => {
    const useMapStore = await treeStore();
    const before = useMapStore.getState().map;
    const yes = named(useMapStore, "Yes, take it");
    useMapStore.getState().deleteBox(yes);
    expect(useMapStore.getState().confirmingDelete).toEqual({ ids: [yes], count: 6 });
    expect(useMapStore.getState().map).toBe(before);
    useMapStore.getState().confirmDelete();
    expect(Object.keys(useMapStore.getState().map.nodes)).toHaveLength(3);
    expect(useMapStore.getState().map.trash[0].nodes).toHaveLength(6);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(before);
  });

  it("restores a deleted branch to its place, and re-tidies", async () => {
    const useMapStore = await treeStore();
    const before = useMapStore.getState().map;
    const yes = named(useMapStore, "Yes, take it");
    useMapStore.getState().deleteBox(yes);
    useMapStore.getState().confirmDelete();
    const settle = useMapStore.getState().settleRequest;
    useMapStore.getState().restoreBoxes(yes);
    const s = useMapStore.getState();
    expect(s.map.nodes).toEqual(before.nodes);
    expect(s.map.links).toEqual(before.links);
    expect(s.map.order).toEqual(before.order);
    expect(s.settleRequest).toBe(settle + 1);
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

describe("map store (arrows)", () => {
  async function treeWith() {
    const useMapStore = await freshStore();
    useMapStore.getState().newFromTemplate(exampleTree(PAGE));
    useMapStore.getState().placeAll(new Map());
    const { useHint } = await import("./hint");
    return { useMapStore, useHint };
  }
  const named = (useMapStore: Awaited<ReturnType<typeof freshStore>>, name: string) =>
    Object.values(useMapStore.getState().map.nodes).find((n) => n.name === name)!.id;
  const arrowInto = (useMapStore: Awaited<ReturnType<typeof freshStore>>, to: NodeId) =>
    Object.values(useMapStore.getState().map.links).find((l) => l.to === to)!;

  it("picks an arrow, letting go of a picked box, and the other way round", async () => {
    const { useMapStore } = await treeWith();
    const raise = named(useMapStore, "Ask for a raise");
    useMapStore.getState().select(raise);
    useMapStore.getState().selectLink(arrowInto(useMapStore, raise).id);
    expect(useMapStore.getState().selected).toBeNull();
    useMapStore.getState().select(raise);
    expect(useMapStore.getState().selectedLink).toBeNull();
  });

  it("refuses to delete a tree box's only way in, saying why where it was tried", async () => {
    const { useMapStore, useHint } = await treeWith();
    const before = useMapStore.getState().map;
    const link = arrowInto(useMapStore, named(useMapStore, "Ask for a raise"));
    useMapStore.getState().deleteLink(link.id, { x: 10, y: 20 });
    expect(useMapStore.getState().map).toBe(before);
    expect(useHint.getState().hint).toMatchObject({ text: expect.stringMatching(/every box needs a parent/), at: { x: 10, y: 20 } });
  });

  it("dragging a tree arrow's end onto a box moves the box it leads to there, as one undo step", async () => {
    const { useMapStore, useHint } = await treeWith();
    const before = useMapStore.getState().map;
    const raise = named(useMapStore, "Ask for a raise");
    const rent = named(useMapStore, "Rent a flat");
    const link = arrowInto(useMapStore, raise);
    useMapStore.getState().reconnect(link.id, "to", rent, { x: 0, y: 0 });
    expect(arrowInto(useMapStore, raise)).toMatchObject({ id: link.id, from: rent });
    expect(useMapStore.getState().selected).toBe(raise);
    // Under its own branch: refused, with the reason.
    const yes = named(useMapStore, "Yes, take it");
    useMapStore.getState().reconnect(arrowInto(useMapStore, yes).id, "from", rent, { x: 0, y: 0 });
    expect(useHint.getState().hint?.text).toMatch(/inside the branch/);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.links).toEqual(before.links);
  });

  it("moves either end of a connections arrow, keeping its label", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().placeAll(new Map());
    const link = Object.values(useMapStore.getState().map.links).find((l) => l.label === "managed by")!;
    const other = Object.values(useMapStore.getState().map.nodes).find((n) => n.name === "Internet connection")!.id;
    useMapStore.getState().reconnect(link.id, "to", other, { x: 0, y: 0 });
    expect(useMapStore.getState().map.links[link.id]).toMatchObject({ from: link.from, to: other, label: "managed by" });
    useMapStore.getState().deleteLink(link.id);
    expect(useMapStore.getState().map.links[link.id]).toBeUndefined();
  });
});

describe("map store (a map named after its start)", () => {
  it("follows the start box's name until the map is renamed by hand", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().newTree();
    useMapStore.getState().placeAll(new Map());
    const start = Object.keys(useMapStore.getState().map.nodes)[0] as NodeId;
    const listed = () => useMapStore.getState().maps.find((m) => m.id === useMapStore.getState().map.id)?.name;
    useMapStore.getState().renameBox(start, "Party");
    expect(useMapStore.getState().map.name).toBe("Party");
    expect(listed()).toBe("Party");
    useMapStore.getState().renameBox(start, "Big party");
    expect(useMapStore.getState().map.name).toBe("Big party");
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.name).toBe("Party");
    expect(listed()).toBe("Party");
    useMapStore.getState().renameMap("My plans");
    useMapStore.getState().renameBox(start, "Small party");
    expect(useMapStore.getState().map.name).toBe("My plans");
  });
});

describe("map store (pasting an outline)", () => {
  it("builds a tree from a pasted outline in one undo step, joined to the new step's own", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().newTree();
    useMapStore.getState().placeAll(new Map());
    const before = useMapStore.getState().map;
    const start = Object.keys(before.nodes)[0] as NodeId;
    useMapStore.getState().startEditing({ kind: "box", id: start });
    const outline = ["Party", "  Food", "    Cake", "    Chips", "  Music", "    Playlist"].join("\n");
    useMapStore.getState().pasteOutline(start, outline, "", "");
    const { map, editing } = useMapStore.getState();
    expect(editing).toBeNull();
    expect(Object.values(map.nodes).map((n) => n.name).sort()).toEqual(["Cake", "Chips", "Food", "Music", "Party", "Playlist"]);
    const parent = (name: string) => {
      const id = Object.values(map.nodes).find((n) => n.name === name)!.id;
      const link = Object.values(map.links).find((l) => l.to === id);
      return link ? map.nodes[link.from].name : null;
    };
    expect([parent("Food"), parent("Cake"), parent("Playlist"), parent("Party")]).toEqual(["Party", "Food", "Music", null]);
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.nodes).toEqual(before.nodes);
  });

  it("without tree rules, asks to place only the new boxes; their placing joins the paste's undo step", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().placeAll(new Map());
    const before = useMapStore.getState().map;
    const [anchor] = Object.keys(before.nodes) as NodeId[];
    const settle = useMapStore.getState().settleRequest;
    useMapStore.getState().pasteOutline(anchor, ["Party", "  Food", "  Music"].join("\n"), "", "");
    const s = useMapStore.getState();
    expect(s.settleRequest).toBe(settle);
    expect(s.placeRequest?.anchor).toBe(anchor);
    expect(s.placeRequest?.ids).toHaveLength(2);
    const [food, music] = s.placeRequest!.ids;
    // What the canvas does: moves only the new boxes, joined to the paste.
    useMapStore.getState().nudgeBoxes(new Map([[food, { x: 900, y: 50 }], [music, { x: 1000, y: 50 }]]));
    const after = useMapStore.getState().map;
    for (const id of Object.keys(before.nodes) as NodeId[]) {
      if (id !== anchor) expect(after.nodes[id]).toBe(before.nodes[id]);
    }
    expect(after.nodes[food]).toMatchObject({ x: 900, y: 50 });
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.nodes).toEqual(before.nodes);
  });

  it("joins the typed text either side of the first line", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().placeAll(new Map());
    const id = useMapStore.getState().addBox({ x: 300, y: 200 });
    useMapStore.getState().pasteOutline(id, "party\nFood", "Big ", "!");
    expect(useMapStore.getState().map.nodes[id].name).toBe("Big party!");
    // The add, the name and the pasted box are one step.
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.nodes[id]).toBeUndefined();
    expect(Object.values(useMapStore.getState().map.nodes).some((n) => n.name === "Food")).toBe(false);
  });
});

describe("map store (several boxes)", () => {
  async function exampleStore() {
    const useMapStore = await freshStore();
    useMapStore.getState().placeAll(new Map(), PAGE);
    return useMapStore;
  }
  const first = (useMapStore: Awaited<ReturnType<typeof freshStore>>, n: number) =>
    (Object.keys(useMapStore.getState().map.nodes) as NodeId[]).slice(0, n);

  it("keeps one box as a plain selection and two or more as a group", async () => {
    const useMapStore = await exampleStore();
    const [a, b] = first(useMapStore, 2);
    useMapStore.getState().selectGroup([a]);
    expect(useMapStore.getState()).toMatchObject({ selected: a, group: [] });
    useMapStore.getState().toggleSelected(b);
    expect(useMapStore.getState()).toMatchObject({ selected: null, group: [a, b] });
    useMapStore.getState().toggleSelected(a);
    expect(useMapStore.getState()).toMatchObject({ selected: b, group: [] });
    useMapStore.getState().selectAll();
    expect(useMapStore.getState().group).toHaveLength(12);
    useMapStore.getState().select(null);
    expect(useMapStore.getState()).toMatchObject({ selected: null, group: [] });
  });

  it("moves, colours and deletes a group, each as one undo step", async () => {
    const useMapStore = await exampleStore();
    const [a, b, c] = first(useMapStore, 3);
    const before = useMapStore.getState().map;
    useMapStore.getState().selectGroup([a, b, c]);

    useMapStore.getState().moveBoxes(new Map([[a, { x: 1, y: 1 }], [b, { x: 2, y: 2 }]]), "drag:x");
    useMapStore.getState().moveBoxes(new Map([[a, { x: 5, y: 5 }], [b, { x: 6, y: 6 }]]), "drag:x");
    useMapStore.getState().setBoxesColor([a, b, c], "green");
    useMapStore.getState().deleteBoxes([a, b, c]);
    expect(Object.keys(useMapStore.getState().map.nodes)).toHaveLength(9);
    expect(useMapStore.getState().group).toEqual([]); // deleted boxes let go

    useMapStore.getState().undo();
    expect(useMapStore.getState().map.nodes[a]).toMatchObject({ x: 5, color: "green" });
    useMapStore.getState().undo();
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toEqual(before);
  });

  it("copies with the arrows between the boxes, pastes a step further each time, and selects the copies", async () => {
    const useMapStore = await exampleStore();
    const { map } = useMapStore.getState();
    const link = Object.values(map.links)[0];
    useMapStore.getState().copyBoxes([link.from, link.to]);

    useMapStore.getState().paste();
    const once = useMapStore.getState();
    expect(Object.keys(once.map.nodes)).toHaveLength(14);
    expect(Object.keys(once.map.links)).toHaveLength(Object.keys(map.links).length + 1);
    const [copy] = once.group;
    expect(once.map.nodes[copy]).toMatchObject({ name: map.nodes[link.from].name, x: map.nodes[link.from].x + 24 });

    useMapStore.getState().paste();
    const twice = useMapStore.getState();
    expect(twice.map.nodes[twice.group[0]].x).toBe(map.nodes[link.from].x + 48);

    useMapStore.getState().undo();
    useMapStore.getState().undo();
    expect(useMapStore.getState().map.nodes).toEqual(map.nodes);
  });

  it("pastes at a spot, centred on it", async () => {
    const useMapStore = await exampleStore();
    const [a] = first(useMapStore, 1);
    useMapStore.getState().copyBoxes([a]);
    useMapStore.getState().paste({ x: 300, y: 200 });
    const s = useMapStore.getState();
    expect(s.map.nodes[s.selected!]).toMatchObject({ x: 300, y: 200 });
  });

  it("duplicates without touching the clipboard, and cuts", async () => {
    const useMapStore = await exampleStore();
    const [a, b] = first(useMapStore, 2);
    useMapStore.getState().duplicateBoxes([a, b]);
    expect(useMapStore.getState().clipboard).toBeNull();
    expect(useMapStore.getState().group).toHaveLength(2);
    useMapStore.getState().cutBoxes([a]);
    expect(useMapStore.getState().map.nodes[a]).toBeUndefined();
    expect(useMapStore.getState().clipboard?.fragment.nodes.map((n) => n.id)).toEqual([a]);
  });

  it("never copies or pastes in a tree, and asks before a group delete takes more", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().newFromTemplate(exampleTree(PAGE));
    useMapStore.getState().placeAll(new Map(), PAGE);
    const named = (name: string) =>
      Object.values(useMapStore.getState().map.nodes).find((n) => n.name === name)!.id;
    const [rent, buy] = [named("Rent a flat"), named("Buy a flat")];

    useMapStore.getState().copyBoxes([rent]);
    expect(useMapStore.getState().clipboard).toBeNull();
    const before = useMapStore.getState().map;
    useMapStore.getState().duplicateBoxes([rent]);
    expect(useMapStore.getState().map).toBe(before);

    // Rent and Buy together take "Live near the office" (both its ways in)
    // and everything after them.
    useMapStore.getState().deleteBoxes([rent, buy]);
    expect(useMapStore.getState().confirmingDelete).toEqual({ ids: [rent, buy], count: 5 });
    useMapStore.getState().confirmDelete();
    expect(useMapStore.getState().map.nodes[named("Yes, take it")]).toBeDefined();
    expect(Object.keys(useMapStore.getState().map.nodes)).toHaveLength(Object.keys(before.nodes).length - 5);
  });
});

describe("restoring all maps", () => {
  const saved = (id: string, name: string) => ({ ...build(["a", "b"], [["a", "b"]]), id: asMapId(id), name });

  /** A first visit: the starter example, tidied (and so saved). */
  async function firstVisit() {
    const useMapStore = await freshStore();
    const ids = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    useMapStore.getState().placeAll(new Map(ids.map((id, i) => [id, { x: i, y: 0 }])), PAGE);
    saveMap(useMapStore.getState().map);
    return useMapStore;
  }

  it("replaces the untouched starter example and opens the newest restored map", async () => {
    const useMapStore = await firstVisit();
    const starter = useMapStore.getState().map.id;
    expect(useMapStore.getState().starter).toBe(starter);

    const result = useMapStore.getState().restoreMaps([saved("A", "Map A"), saved("B", "Map B")]);
    expect(result).toEqual({ added: 2, alreadyHere: 0 });
    const s = useMapStore.getState();
    expect(s.maps.map((m) => m.id)).toEqual(["A", "B"]);
    expect(s.map.id).toBe("B");
    expect(s.starter).toBeNull();
    expect(loadMap(starter, PAGE)).toBeNull();
    expect(loadRegistry().map((m) => m.id)).toEqual(["A", "B"]);
  });

  it("is safe twice, and never overwrites a map already here", async () => {
    const useMapStore = await firstVisit();
    useMapStore.getState().restoreMaps([saved("A", "Map A")]);
    useMapStore.getState().renameMap("Mine now");
    saveMap(useMapStore.getState().map); // what auto-save would do

    const again = useMapStore.getState().restoreMaps([saved("A", "Map A"), saved("B", "Map B")]);
    expect(again).toEqual({ added: 1, alreadyHere: 1 });
    expect(loadMap(asMapId("A"), PAGE)?.name).toBe("Mine now");
    expect(useMapStore.getState().maps.map((m) => m.id)).toEqual(["A", "B"]);
  });

  it("keeps the starter once it is changed: it is the user's map then", async () => {
    const useMapStore = await firstVisit();
    const starter = useMapStore.getState().map.id;
    useMapStore.getState().renameMap("My map");
    expect(useMapStore.getState().starter).toBeNull();

    useMapStore.getState().restoreMaps([saved("A", "Map A")]);
    expect(useMapStore.getState().maps.map((m) => m.id)).toEqual([starter, "A"]);
  });

  it("has no starter when maps were already saved (the old address)", async () => {
    saveMap(saved("A", "Map A"));
    expect((await freshStore()).getState().starter).toBeNull();
  });
});

describe("a linked tree in the store", () => {
  /** Boardkit's board "Move?" (lists rent with card a, buy), and Linkkit's
      placed copy of its tree, open. `fullTrash`: the board's trash
      already holds Boardkit's 200 cards. */
  async function linkedStore(fullTrash = false) {
    const old = fullTrash ? Array.from({ length: 200 }, (_, i) => `old${i}`) : [];
    const board = {
      lists: { rent: { id: "rent", title: "Rent" }, buy: { id: "buy", title: "Buy" } },
      cards: { a: { id: "a", title: "A" }, ...Object.fromEntries(old.map((k) => [k, { id: k, title: k }])) },
      listOrder: ["rent", "buy"],
      cardOrder: { rent: ["a"], buy: [] },
      trash: old.map((k, i) => ({ cardId: k, listId: "rent", deletedAt: i })),
      trashedLists: [],
    };
    localStorage.setItem("boardkit:board:move", JSON.stringify({ version: 2, rev: 1, board }));
    localStorage.setItem(
      "boardkit:registry",
      JSON.stringify({ version: 1, boards: [{ id: "move", name: "Move?" }], activeBoardId: "move" }),
    );
    const { boardToTree } = await import("../domain/bridge");
    const { serializeStored } = await import("../domain/persistence");
    const view = { page: PAGE, direction: "TB" as const, arrowLength: 47, hideCut: false, collapsed: [], places: {}, colors: {}, labels: {}, notes: {} };
    const tree = boardToTree("move", "Move?", board, view).map;
    const nodes = Object.fromEntries(Object.values(tree.nodes).map((n, i) => [n.id, { ...n, x: 100 * (i + 1), y: 50 }]));
    const copy = { ...tree, id: asMapId("m1"), nodes, linkedBoard: "move" };
    localStorage.setItem("linkkit:map:m1", JSON.stringify(serializeStored(copy, 1)));
    localStorage.setItem("linkkit:active", "m1");
    const useMapStore = await freshStore();
    const { useSyncNotice } = await import("./syncNotice");
    const { useLinkHold } = await import("./linkHold");
    return { useMapStore, useSyncNotice, useLinkHold };
  }

  it("opens from the board and refuses a step under a card, saying why", async () => {
    const { useMapStore } = await linkedStore();
    expect(useMapStore.getState().map.linkedBoard).toBe("move");
    expect(useMapStore.getState().needsTidy).toBe(false);
    expect(useMapStore.getState().addNextStep(asNodeId("a"))).toBeNull();
    const { useHint } = await import("./hint");
    expect(useHint.getState().hint?.text).toMatch(/“A” is a card, and cards can.t have next steps in Boardkit/);
    expect(useMapStore.getState().addNextStep(asNodeId("buy"))).not.toBeNull();
  });

  it("moves a card to another list, but never a list under another", async () => {
    const { useMapStore, useSyncNotice } = await linkedStore();
    useMapStore.getState().moveToParent(asNodeId("a"), asNodeId("buy"), null);
    expect(Object.values(useMapStore.getState().map.links).find((l) => l.to === "a")?.from).toBe("buy");
    // Picked, so its new way back to the start lights up.
    expect(useMapStore.getState().selected).toBe("a");
    const before = useMapStore.getState().map;
    useMapStore.getState().moveToParent(asNodeId("rent"), asNodeId("buy"), null);
    expect(useMapStore.getState().map).toBe(before);
    expect(useSyncNotice.getState().message?.text).toBe("“Rent” is a list in Boardkit: lists can only be reordered.");
  });

  it("refuses a second way into a card", async () => {
    const { useMapStore } = await linkedStore();
    const before = useMapStore.getState().map;
    useMapStore.getState().connect(asNodeId("buy"), asNodeId("a"));
    expect(useMapStore.getState().map).toBe(before);
  });

  it("renames the map and its start box together", async () => {
    const { useMapStore } = await linkedStore();
    useMapStore.getState().renameMap("Stay?");
    const { map, maps } = useMapStore.getState();
    expect(map.name).toBe("Stay?");
    expect(map.nodes[asNodeId("move")].name).toBe("Stay?");
    expect(maps.find((m) => m.id === "m1")?.name).toBe("Stay?");
    useMapStore.getState().renameBox(asNodeId("move"), "Go?");
    expect(useMapStore.getState().map.name).toBe("Go?");
  });

  it("keeps a blank card, which reaches the board as an empty title, but never a blank board name", async () => {
    const { useMapStore } = await linkedStore();
    useMapStore.getState().renameBox(asNodeId("move"), "  ");
    expect(useMapStore.getState().map.nodes[asNodeId("move")].name).toBe("Move?");
    const id = useMapStore.getState().addNextStep(asNodeId("buy"))!;
    useMapStore.getState().stopEditing();
    expect(useMapStore.getState().map.nodes[id].name).toBe("");
    const { saveMap: save } = await import("./persistMap");
    save(useMapStore.getState().map);
    const board = JSON.parse(localStorage.getItem("boardkit:board:move")!).board;
    expect(board.cards[id]).toMatchObject({ id, title: "" });
    expect(board.cardOrder.buy).toEqual([id]);
  });

  it("deletes into the board's trash only, with no trash entry of its own", async () => {
    const { useMapStore } = await linkedStore();
    useMapStore.getState().deleteBox(asNodeId("a"));
    const { map, trashWarning } = useMapStore.getState();
    expect(trashWarning).toBeNull();
    expect(map.nodes[asNodeId("a")]).toBeUndefined();
    expect(map.trash).toEqual([]);
  });

  it("asks first when the board's trash is full, naming the oldest card", async () => {
    const { useMapStore } = await linkedStore(true);
    const before = useMapStore.getState().map;
    useMapStore.getState().deleteBox(asNodeId("a"));
    const warning = useMapStore.getState().trashWarning;
    expect(warning?.kind === "board" && warning.action === "delete" && warning.erased.map((e) => e.title)).toEqual(["old0"]);
    expect(useMapStore.getState().map).toBe(before);
    useMapStore.getState().confirmTrashWarning();
    expect(useMapStore.getState().map.nodes[asNodeId("a")]).toBeUndefined();
    expect(useMapStore.getState().map.trash).toEqual([]);
  });

  it("asks before an undo that would put a box into the board's full trash", async () => {
    const { useMapStore } = await linkedStore(true);
    const added = useMapStore.getState().addNextStep(asNodeId("buy"))!;
    useMapStore.getState().renameBox(added, "New");
    useMapStore.getState().stopEditing();
    const { saveMap } = await import("./persistMap");
    saveMap(useMapStore.getState().map);
    const before = useMapStore.getState().map;
    useMapStore.getState().undo();
    const warning = useMapStore.getState().trashWarning;
    expect(warning?.kind === "board" && warning.action).toBe("undo");
    expect(useMapStore.getState().map).toBe(before);
    useMapStore.getState().cancelTrashWarning();
    expect(useMapStore.getState().map.nodes[added]).toBeDefined();
  });

  it("unlinks into an ordinary tree, leaving the board in Boardkit", async () => {
    const { useMapStore } = await linkedStore();
    useMapStore.getState().moveBox(asNodeId("a"), { x: 5, y: 5 });
    useMapStore.getState().unlinkFromBoard();
    const { map, history } = useMapStore.getState();
    expect(map.linkedBoard).toBeUndefined();
    expect(history.past).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("linkkit:map:m1")!).version).toBe(1);
    expect(localStorage.getItem("boardkit:board:move")).not.toBeNull();
    // An ordinary tree again: a step under a card is fine.
    expect(useMapStore.getState().addNextStep(asNodeId("a"))).not.toBeNull();
  });

  it("links a tree as a new board, after saying what it will make", async () => {
    const { useMapStore } = await linkedStore();
    const { linkPreview } = await import("./mapStore");
    useMapStore.getState().unlinkFromBoard();
    expect(linkPreview(useMapStore.getState().map)).toEqual({ kind: "ok", name: "Move?", lists: 2, cards: 1, trashed: 0 });
    expect(useMapStore.getState().linkToBoard()).toBe(true);
    const { map } = useMapStore.getState();
    // "move" is still a board in Boardkit: the start box got a fresh id.
    expect(map.linkedBoard).toBeDefined();
    expect(map.linkedBoard).not.toBe("move");
    const list = JSON.parse(localStorage.getItem("boardkit:registry")!);
    expect(list.boards.map((b: { id: string }) => b.id)).toEqual(["move", map.linkedBoard]);
    expect(linkPreview(map)).toEqual({ kind: "unavailable" });
  });

  it("names the boxes in the way of a link, and offers none without Boardkit", async () => {
    const { useMapStore } = await linkedStore();
    const { linkPreview } = await import("./mapStore");
    useMapStore.getState().unlinkFromBoard();
    const step = useMapStore.getState().addNextStep(asNodeId("a"))!;
    useMapStore.getState().renameBox(step, "Deep");
    expect(linkPreview(useMapStore.getState().map)).toEqual({ kind: "refused", problems: ['"Deep" is 4 levels deep.'] });
    localStorage.removeItem("boardkit:registry");
    expect(linkPreview(useMapStore.getState().map)).toEqual({ kind: "unavailable" });
  });

  /** Boardkit renames a card: the board record as Boardkit would store it. */
  function boardkitRenames(card: string, title: string) {
    const stored = JSON.parse(localStorage.getItem("boardkit:board:move")!);
    stored.board.cards[card] = { ...stored.board.cards[card], title };
    localStorage.setItem("boardkit:board:move", JSON.stringify({ ...stored, rev: stored.rev + 1 }));
  }

  it("keeps undo after taking in a Boardkit change, and undoes only its own item", async () => {
    const { useMapStore } = await linkedStore();
    const { saveMap } = await import("./persistMap");
    useMapStore.getState().renameBox(asNodeId("rent"), "Renting");
    saveMap(useMapStore.getState().map);
    boardkitRenames("a", "A from Boardkit");
    // The next save takes Boardkit's change in.
    useMapStore.getState().moveBox(asNodeId("buy"), { x: 7, y: 7 });
    saveMap(useMapStore.getState().map);
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(useMapStore.getState().map.nodes[asNodeId("a")].name).toBe("A from Boardkit");
    expect(useMapStore.getState().history.past).toHaveLength(2);
    useMapStore.getState().undo();
    useMapStore.getState().undo();
    const { map } = useMapStore.getState();
    expect(map.nodes[asNodeId("rent")].name).toBe("Rent");
    expect(map.nodes[asNodeId("a")].name).toBe("A from Boardkit");
  });

  it("refuses an undo whose card Boardkit changed too, naming it", async () => {
    const { useMapStore, useSyncNotice } = await linkedStore();
    const { saveMap } = await import("./persistMap");
    useMapStore.getState().renameBox(asNodeId("a"), "Mine");
    saveMap(useMapStore.getState().map);
    boardkitRenames("a", "Theirs");
    useMapStore.getState().moveBox(asNodeId("buy"), { x: 7, y: 7 });
    saveMap(useMapStore.getState().map);
    await new Promise((r) => queueMicrotask(() => r(null)));
    useMapStore.getState().undo();
    const before = useMapStore.getState().map;
    useMapStore.getState().undo();
    expect(useMapStore.getState().map).toBe(before);
    expect(useMapStore.getState().map.nodes[asNodeId("a")].name).toBe("Theirs");
    expect(useMapStore.getState().history.past).toEqual([]);
    expect(useMapStore.getState().history.future).toHaveLength(1);
    expect(useSyncNotice.getState().message?.text).toBe("Can't undo further: “Theirs” was changed in Boardkit or another tab.");
  });

  it("changes nothing while its board can't be written", async () => {
    const { useMapStore, useLinkHold } = await linkedStore();
    useLinkHold.getState().hold(asMapId("m1"), "damaged");
    const before = useMapStore.getState().map;
    useMapStore.getState().renameBox(asNodeId("a"), "Nope");
    useMapStore.getState().moveBox(asNodeId("a"), { x: 1, y: 1 });
    expect(useMapStore.getState().map).toBe(before);
  });
});

describe("map store (notes)", () => {
  it("makes one stretch of typing in one box's notes one undo step", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().placeAll(new Map(), PAGE);
    const [a, b] = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    const s = () => useMapStore.getState();
    s().openNotes(a);
    expect(s().notesOpen).toBe(true);
    expect(s().selected).toBe(a);
    s().setBoxNotes(a, "h");
    s().setBoxNotes(a, "hi");
    s().setBoxNotes(a, "hi\nthere");
    // Showing another box ends the step.
    s().openNotes(b);
    s().setBoxNotes(b, "b");
    s().closeNotes();
    expect(s().notesOpen).toBe(false);
    s().undo();
    expect(s().map.nodes[b]).not.toHaveProperty("notes");
    expect(s().map.nodes[a].notes).toBe("hi\nthere");
    s().undo();
    expect(s().map.nodes[a]).not.toHaveProperty("notes");
  });

  it("closes the panel when no box is selected, and on another map", async () => {
    const useMapStore = await freshStore();
    useMapStore.getState().placeAll(new Map(), PAGE);
    const [a] = Object.keys(useMapStore.getState().map.nodes) as NodeId[];
    useMapStore.getState().openNotes(a);
    useMapStore.getState().select(null);
    expect(useMapStore.getState().notesOpen).toBe(false);
    useMapStore.getState().openNotes(a);
    useMapStore.getState().newMap();
    expect(useMapStore.getState().notesOpen).toBe(false);
  });
});
