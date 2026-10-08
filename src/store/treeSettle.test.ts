import { beforeEach, describe, expect, it, vi } from "vitest";

import { layoutMap } from "../domain/layout";
import { startOf } from "../domain/tree";
import type { NodeId, Point } from "../domain/types";
import { memoryStorage } from "./memoryStorage";

/** A fresh store and key handler (they read localStorage as they load),
    with a tree: start -> a, b. Nothing selected or being typed. */
async function tree() {
  vi.resetModules();
  const { useMapStore } = await import("./mapStore");
  const { onMapKey } = await import("../features/map/useMapShortcuts");
  const press = (key: string) =>
    onMapKey({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: null, preventDefault: () => {} });
  const s = () => useMapStore.getState();
  s().newTree();
  s().placeAll(new Map());
  const start = startOf(s().map)!;
  s().stopEditing();
  const a = s().addNextStep(start)!;
  s().renameBox(a, "A");
  s().stopEditing();
  const b = s().addNextStep(start)!;
  s().renameBox(b, "B");
  s().stopEditing();
  s().select(a);
  return { useMapStore, s, press, start, a, b };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("re-tidy after a rename", () => {
  it("waits for the new size, then goes ahead when nothing happened in between", async () => {
    const { s, a } = await tree();
    s().renameBox(a, "A much longer name");
    expect(s().renameSettle?.id).toBe(a);
    expect(s().takeRenameSettle()).toBe(true);
    expect(s().renameSettle).toBeNull();
  });

  it("is called off by a drag straight after the rename", async () => {
    const { s, a } = await tree();
    s().renameBox(a, "A much longer name");
    s().moveBoxes(new Map([[a, { x: 300, y: 300 }]]), "drag:test");
    expect(s().takeRenameSettle()).toBe(false);
  });

  it("is called off by Tab straight after the rename", async () => {
    const { s, press, a } = await tree();
    s().renameBox(a, "A much longer name");
    press("Tab");
    expect(Object.keys(s().map.nodes)).toHaveLength(4);
    expect(s().takeRenameSettle()).toBe(false);
  });

  it("is called off by an arrow-key move straight after the rename", async () => {
    const { s, press, a } = await tree();
    s().renameBox(a, "A much longer name");
    press("ArrowUp");
    expect(s().renameSettle).toBeNull();
    expect(s().takeRenameSettle()).toBe(false);
  });

  it("is not needed for a new step being named: it makes room as it is typed", async () => {
    const { s, start } = await tree();
    const c = s().addNextStep(start)!;
    s().renameBox(c, "C");
    expect(s().renameSettle).toBeNull();
  });
});

describe("a tree box let go on bare paper", () => {
  it("goes back home, leaves no undo step, and asks for a glide from where it was let go", async () => {
    const { s, a } = await tree();
    const home = { x: s().map.nodes[a].x, y: s().map.nodes[a].y };
    const steps = s().history.past.length;
    s().moveBoxes(new Map([[a, { x: home.x + 200, y: home.y + 150 }]]), "drag:7");
    s().moveBoxes(new Map([[a, { x: home.x + 250, y: home.y + 180 }]]), "drag:7");
    s().cancelDrag("drag:7");
    expect(s().map.nodes[a]).toMatchObject(home);
    expect(s().history.past.length).toBe(steps);
    expect(s().glideRequest?.from.get(a)).toEqual({ x: home.x + 250, y: home.y + 180 });
  });

  it("does nothing for a drag that is no longer the latest step", async () => {
    const { s, a } = await tree();
    s().moveBoxes(new Map([[a, { x: 1, y: 2 }]]), "drag:8");
    s().setBoxColor(a, "red");
    s().cancelDrag("drag:8");
    expect(s().map.nodes[a]).toMatchObject({ x: 1, y: 2, color: "red" });
  });
});

describe("the first reflow of an existing tree into the new layout", () => {
  it("is one undo step", async () => {
    const { s } = await tree();
    // Boxes where an older Linkkit left them.
    const old = new Map<NodeId, Point>(Object.keys(s().map.nodes).map((id, i) => [id as NodeId, { x: 40 + i * 300, y: 500 - i * 90 }]));
    s().moveBoxes(old, "drag:old");
    const before = s().map.nodes;
    const steps = s().history.past.length;
    const options = { columnGap: 32, rowGap: 64, fallbackSize: { width: 120, height: 40 } };
    s().placeAll(layoutMap(s().map, new Map(), options).positions);
    expect(s().history.past.length).toBe(steps + 1);
    s().undo();
    expect(s().map.nodes).toEqual(before);
  });
});
