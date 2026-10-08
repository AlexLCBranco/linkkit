import { beforeEach, describe, expect, it, vi } from "vitest";

import { comboMatches, SHORTCUTS, type KeyCombo, type Shortcut } from "../../domain/shortcuts";
import { startOf } from "../../domain/tree";
import type { LinkId, NodeId } from "../../domain/types";
import { memoryStorage } from "../../store/memoryStorage";

/** Every key worth trying: letters, digits, F-keys and the named keys. */
const KEYS = [
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ...["Enter", "Escape", "Tab", " ", "Delete", "Backspace", "Home", "End", "PageUp", "PageDown", "Insert"],
  ...["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "?", "/", "+", "-", "=", ",", "."],
];
const MODIFIERS = [
  { ctrlKey: false, metaKey: false, shiftKey: false },
  { ctrlKey: false, metaKey: false, shiftKey: true },
  { ctrlKey: true, metaKey: false, shiftKey: false },
  { ctrlKey: true, metaKey: false, shiftKey: true },
  { ctrlKey: false, metaKey: true, shiftKey: false },
];

type Kind = "connections" | "tree";
interface Situation {
  readonly name: string;
  readonly kind: Kind;
  /** Loads fresh modules, sets the situation up, and swaps every store
      action (and the dialog's opener) for a spy. */
  readonly setUp: () => Promise<{ onMapKey: (typeof import("./useMapShortcuts"))["onMapKey"]; spies: ReturnType<typeof vi.fn>[] }>;
}

async function load() {
  vi.resetModules();
  const { useMapStore } = await import("../../store/mapStore");
  const { useShortcutsDialog } = await import("../../store/shortcutsDialog");
  const { onMapKey } = await import("./useMapShortcuts");
  const spyAll = () => {
    const spies: ReturnType<typeof vi.fn>[] = [];
    const state = useMapStore.getState() as unknown as Record<string, unknown>;
    const swapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      if (typeof value !== "function") continue;
      const spy = vi.fn();
      spies.push(spy);
      swapped[key] = spy;
    }
    useMapStore.setState(swapped);
    const open = vi.fn();
    spies.push(open);
    useShortcutsDialog.setState({ setOpen: open });
    return { onMapKey, spies };
  };
  return { useMapStore, spyAll };
}

const SITUATIONS: readonly Situation[] = [
  {
    name: "a box selected (connections)",
    kind: "connections",
    setUp: async () => {
      const { useMapStore, spyAll } = await load();
      useMapStore.getState().select(Object.keys(useMapStore.getState().map.nodes)[0] as NodeId);
      return spyAll();
    },
  },
  {
    name: "an arrow picked (connections)",
    kind: "connections",
    setUp: async () => {
      const { useMapStore, spyAll } = await load();
      useMapStore.getState().select(null);
      useMapStore.setState({ selectedLink: Object.keys(useMapStore.getState().map.links)[0] as LinkId });
      return spyAll();
    },
  },
  {
    name: "a child selected (tree)",
    kind: "tree",
    setUp: async () => {
      const { useMapStore, spyAll } = await load();
      const s = useMapStore.getState();
      s.newTree();
      const start = startOf(useMapStore.getState().map)!;
      useMapStore.getState().stopEditing();
      useMapStore.getState().addNextStep(start);
      const editing = useMapStore.getState().editing;
      if (editing?.kind !== "box") throw new Error("no new box");
      useMapStore.getState().renameBox(editing.id, "Child");
      useMapStore.getState().stopEditing();
      useMapStore.getState().select(editing.id);
      return spyAll();
    },
  },
  {
    name: "nothing selected (tree)",
    kind: "tree",
    setUp: async () => {
      const { useMapStore, spyAll } = await load();
      useMapStore.getState().newTree();
      useMapStore.getState().stopEditing();
      useMapStore.getState().select(null);
      return spyAll();
    },
  },
];

/** Presses one key; true if the handler did anything with it. */
function reacts(onMapKey: (typeof import("./useMapShortcuts"))["onMapKey"], spies: ReturnType<typeof vi.fn>[], press: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
  for (const spy of spies) spy.mockClear();
  const preventDefault = vi.fn();
  onMapKey({ altKey: false, target: null, preventDefault, ...press });
  return preventDefault.mock.calls.length > 0 || spies.some((spy) => spy.mock.calls.length > 0);
}

/** The browser's spelling of a table key ("arrowup" is "ArrowUp"). */
const realKey = (key: string) => KEYS.find((k) => k.toLowerCase() === key) ?? key;

const MAP_ROWS = (Object.values(SHORTCUTS) as Shortcut[]).filter((row) => !("typing" in row && row.typing));
const listedFor = (press: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) =>
  MAP_ROWS.filter((row) => row.combos.some((combo) => comboMatches(press, combo)));

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("the shortcut table and the key handler", () => {
  for (const situation of SITUATIONS) {
    it(`every key the map reacts to is in the dialog: ${situation.name}`, async () => {
      const { onMapKey, spies } = await situation.setUp();
      const unlisted: string[] = [];
      for (const key of KEYS) {
        for (const mods of MODIFIERS) {
          const press = { key: mods.shiftKey && key.length === 1 ? key.toUpperCase() : key, ...mods };
          if (!reacts(onMapKey, spies, press)) continue;
          const rows = listedFor(press);
          // A "Trees only" key must not do anything outside a tree.
          const fits = rows.some((row) => row.only !== "tree" || situation.kind === "tree");
          if (!fits) unlisted.push(JSON.stringify(press));
        }
      }
      expect(unlisted).toEqual([]);
    });
  }

  it("every key in the dialog does something somewhere", async () => {
    const dead: string[] = [];
    for (const row of MAP_ROWS) {
      for (const combo of row.combos as readonly KeyCombo[]) {
        let works = false;
        for (const situation of SITUATIONS) {
          if (row.only === "tree" && situation.kind !== "tree") continue;
          const { onMapKey, spies } = await situation.setUp();
          for (const ctrl of combo.mod ? [true] : [false]) {
            const press = { key: realKey(combo.key), ctrlKey: ctrl, metaKey: false, shiftKey: combo.shift ?? false };
            if (reacts(onMapKey, spies, press)) works = true;
          }
          if (works) break;
        }
        if (!works) dead.push(`${row.does}: ${JSON.stringify(combo)}`);
      }
    }
    expect(dead).toEqual([]);
  });
});
