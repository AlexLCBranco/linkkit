import { beforeEach, describe, expect, it, vi } from "vitest";

import { asNodeId } from "../../domain/ids";
import { startOf } from "../../domain/tree";
import type { NodeId } from "../../domain/types";
import { memoryStorage } from "../../store/memoryStorage";
import { boxFlowNode } from "./flowNodes";
import { MAP_LAYOUT } from "./layoutConfig";

/** The store reads localStorage when its module loads, so each test loads
    fresh copies of it and of the key handler. */
async function fresh() {
  vi.resetModules();
  const { useMapStore } = await import("../../store/mapStore");
  const { onMapKey } = await import("./useMapShortcuts");
  const press = (key: string, extra: { shiftKey?: boolean } = {}) => {
    const event = {
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: extra.shiftKey ?? false,
      target: null,
      preventDefault: vi.fn(),
    };
    onMapKey(event);
    return event;
  };
  return { useMapStore, press };
}

/** A new tree with its start named, nothing selected or being typed. */
async function freshTree() {
  const t = await fresh();
  const s = t.useMapStore.getState();
  s.newTree();
  const start = startOf(t.useMapStore.getState().map)!;
  t.useMapStore.getState().stopEditing();
  t.useMapStore.getState().select(null);
  return { ...t, start };
}

/** Types a name into the box being edited and presses Enter. */
function name(useMapStore: Awaited<ReturnType<typeof fresh>>["useMapStore"], text: string): NodeId {
  const editing = useMapStore.getState().editing;
  if (editing?.kind !== "box") throw new Error("nothing being typed");
  useMapStore.getState().renameBox(editing.id, text);
  useMapStore.getState().stopEditing();
  return editing.id;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("Tab in a tree", () => {
  it("adds a next step under the selected box, open for typing and selected", async () => {
    const { useMapStore, press, start } = await freshTree();
    useMapStore.getState().select(start);
    const tab = press("Tab");
    expect(tab.preventDefault).toHaveBeenCalled();
    const s = useMapStore.getState();
    const added = s.editing?.kind === "box" ? s.editing.id : null;
    expect(added).not.toBeNull();
    expect(s.selected).toBe(added);
    expect(Object.values(s.map.links).some((l) => l.from === start && l.to === added)).toBe(true);
  });

  it("chains: after naming, the new box stays selected and Tab goes one deeper", async () => {
    const { useMapStore, press, start } = await freshTree();
    useMapStore.getState().select(start);
    press("Tab");
    const child = name(useMapStore, "Child");
    expect(useMapStore.getState().selected).toBe(child);
    press("Tab");
    const grandchild = name(useMapStore, "Grandchild");
    const links = Object.values(useMapStore.getState().map.links);
    expect(links.some((l) => l.from === child && l.to === grandchild)).toBe(true);
  });

  it("Esc on the blank new box takes it back and selects its parent again", async () => {
    const { useMapStore, press, start } = await freshTree();
    useMapStore.getState().select(start);
    press("Tab");
    useMapStore.getState().stopEditing(true);
    const s = useMapStore.getState();
    expect(Object.keys(s.map.nodes)).toEqual([start]);
    expect(s.selected).toBe(start);
  });

  it("does nothing with nothing selected, or with Shift", async () => {
    const { useMapStore, press, start } = await freshTree();
    expect(press("Tab").preventDefault).not.toHaveBeenCalled();
    useMapStore.getState().select(start);
    expect(press("Tab", { shiftKey: true }).preventDefault).not.toHaveBeenCalled();
    expect(Object.keys(useMapStore.getState().map.nodes)).toHaveLength(1);
  });

  it("is left to the browser in a map without tree rules", async () => {
    const { useMapStore, press } = await fresh();
    const box = Object.keys(useMapStore.getState().map.nodes)[0] as NodeId;
    useMapStore.getState().select(box);
    const before = useMapStore.getState().map;
    expect(press("Tab").preventDefault).not.toHaveBeenCalled();
    expect(useMapStore.getState().map).toBe(before);
  });
});

describe("Enter and F2", () => {
  it("rename the selected box", async () => {
    const { useMapStore, press, start } = await freshTree();
    useMapStore.getState().select(start);
    expect(press("Enter").preventDefault).toHaveBeenCalled();
    expect(useMapStore.getState().editing).toEqual({ kind: "box", id: start });
    useMapStore.getState().stopEditing();
    press("F2");
    expect(useMapStore.getState().editing).toEqual({ kind: "box", id: start });
  });

  it("do nothing with nothing selected", async () => {
    const { useMapStore, press } = await freshTree();
    press("Enter");
    press("F2");
    expect(useMapStore.getState().editing).toBeNull();
  });
});

describe("arrow keys in a tree", () => {
  /** start -> a, b (a left of b); a -> c. */
  async function small() {
    const t = await freshTree();
    const { useMapStore, press, start } = t;
    useMapStore.getState().select(start);
    press("Tab");
    const a = name(useMapStore, "A");
    press("Tab");
    const c = name(useMapStore, "C");
    useMapStore.getState().select(start);
    press("Tab");
    const b = name(useMapStore, "B");
    useMapStore.getState().nudgeBoxes(
      new Map([
        [start, { x: 200, y: 0 }],
        [a, { x: 100, y: 100 }],
        [b, { x: 300, y: 100 }],
        [c, { x: 100, y: 200 }],
      ]),
    );
    useMapStore.getState().select(null);
    return { ...t, a, b, c };
  }

  it("with nothing selected, any arrow picks the start", async () => {
    const { useMapStore, press, start } = await small();
    expect(press("ArrowRight").preventDefault).toHaveBeenCalled();
    expect(useMapStore.getState().selected).toBe(start);
  });

  it("↓ goes to a next step, ↑ back to the parent, ←/→ along the row", async () => {
    const { useMapStore, press, start, a, b, c } = await small();
    useMapStore.getState().select(start);
    // B was the last next step selected under the start (just named).
    press("ArrowDown");
    expect(useMapStore.getState().selected).toBe(b);
    press("ArrowLeft");
    expect(useMapStore.getState().selected).toBe(a);
    press("ArrowRight");
    expect(useMapStore.getState().selected).toBe(b);
    press("ArrowLeft");
    press("ArrowDown");
    expect(useMapStore.getState().selected).toBe(c);
    press("ArrowUp");
    expect(useMapStore.getState().selected).toBe(a);
    press("ArrowUp");
    expect(useMapStore.getState().selected).toBe(start);
  });

  it("↓ goes back to the next step last visited", async () => {
    const { useMapStore, press, start, b } = await small();
    useMapStore.getState().select(b);
    press("ArrowUp");
    expect(useMapStore.getState().selected).toBe(start);
    press("ArrowDown");
    expect(useMapStore.getState().selected).toBe(b);
  });

  it("turn with a left-right tree", async () => {
    const { useMapStore, press, start, b } = await small();
    useMapStore.setState((s) => ({ map: { ...s.map, direction: "LR" } }));
    useMapStore.getState().select(start);
    press("ArrowRight");
    expect(useMapStore.getState().selected).toBe(b);
    press("ArrowLeft");
    expect(useMapStore.getState().selected).toBe(start);
  });

  it("do nothing while a name is being typed", async () => {
    const { useMapStore, press, a } = await small();
    useMapStore.getState().select(a);
    useMapStore.getState().startEditing({ kind: "box", id: a });
    expect(press("ArrowDown").preventDefault).not.toHaveBeenCalled();
    expect(useMapStore.getState().selected).toBe(a);
  });
});

describe("focus on create", () => {
  it("a box React Flow hasn't measured yet still has a size, so it shows and its name field can take focus", () => {
    const node = boxFlowNode(asNodeId("new"), { x: 10, y: 20 }, undefined);
    expect(node.initialWidth).toBe(MAP_LAYOUT.fallbackSize.width);
    expect(node.initialHeight).toBe(MAP_LAYOUT.fallbackSize.height);
    expect(node.measured).toBeUndefined();
  });

  it("a new step opens its name for typing the moment it is added", async () => {
    const { useMapStore, start } = await freshTree();
    const added = useMapStore.getState().addNextStep(start);
    expect(useMapStore.getState().editing).toEqual({ kind: "box", id: added });
  });
});

describe("a new tree map", () => {
  it("opens its start for typing, selected, so Tab follows straight on", async () => {
    const { useMapStore, press } = await fresh();
    useMapStore.getState().newTree();
    useMapStore.getState().placeAll(new Map());
    const start = startOf(useMapStore.getState().map)!;
    expect(useMapStore.getState()).toMatchObject({ selected: start, editing: { kind: "box", id: start } });
    name(useMapStore, "Move abroad?");
    press("Tab");
    expect(Object.keys(useMapStore.getState().map.nodes)).toHaveLength(2);
  });

  it("is drawn as Treekit draws trees: elbow lines and Treekit's text", async () => {
    const { useMapStore } = await freshTree();
    expect(useMapStore.getState().map).toMatchObject({ arrowStyle: "elbow", labelStyle: "treekit" });
  });
});
