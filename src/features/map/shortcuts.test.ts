import { beforeEach, describe, expect, it, vi } from "vitest";

import { comboMatches, SHORTCUTS, type KeyCombo, type Shortcut } from "../../domain/shortcuts";
import { startOf } from "../../domain/tree";
import type { LinkId, MapKind, NodeId } from "../../domain/types";
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

type Kind = MapKind;
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
  const { useLinkPrompt } = await import("../../store/linkPrompt");
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
    // The link field's opener (Ctrl+K) too.
    const openLink = vi.fn();
    spies.push(openLink);
    useLinkPrompt.setState({ open: openLink });
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
    name: "a step selected (steps)",
    kind: "steps",
    setUp: async () => {
      const { useMapStore, spyAll } = await load();
      useMapStore.getState().newSteps("check");
      useMapStore.getState().stopEditing();
      useMapStore.getState().select(startOf(useMapStore.getState().map)!);
      return spyAll();
    },
  },
  {
    name: "a match selected (bracket)",
    kind: "bracket",
    setUp: async () => {
      const { useMapStore, spyAll } = await load();
      useMapStore.getState().newBracket(4);
      useMapStore.getState().placeAll(new Map());
      useMapStore.getState().stopEditing();
      useMapStore.getState().select(Object.keys(useMapStore.getState().map.nodes)[0] as NodeId);
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

const MAP_ROWS = (Object.values(SHORTCUTS) as Shortcut[]).filter((row) => !("typing" in row && row.typing) && !("onRow" in row && row.onRow));
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
          // A key tagged with some kinds of map must not do anything in
          // another; copy and paste may still answer there, with a hint
          // saying why not.
          const fits = rows.some((row) => !row.only || row.only.includes(situation.kind) || row.only.includes("connections"));
          if (!fits) unlisted.push(JSON.stringify(press));
        }
      }
      expect(unlisted).toEqual([]);
    });
  }

  it("every key in the dialog does something somewhere", async () => {
    const dead: string[] = [];
    for (const row of MAP_ROWS) {
      // Paste: the key itself only acts while Linkkit holds copied boxes;
      // otherwise the browser's paste event does the work (tested below).
      if (row === SHORTCUTS.paste) continue;
      for (const combo of row.combos as readonly KeyCombo[]) {
        let works = false;
        for (const situation of SITUATIONS) {
          if (row.only && !row.only.includes(situation.kind)) continue;
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

describe("Ctrl+V on the map", () => {
  const ctrlV = { key: "v", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: null };
  const pasteOf = (text: string) => ({ target: null, clipboardData: { getData: () => text }, preventDefault: vi.fn() });

  async function plain() {
    const { useMapStore } = await load();
    const { onMapKey, onMapPaste } = await import("./useMapShortcuts");
    const s = () => useMapStore.getState();
    s().newMap();
    const a = s().addBox({ x: 200, y: 200 });
    s().renameBox(a, "A");
    s().stopEditing();
    return { s, a, onMapKey, onMapPaste };
  }
  const namesOf = (s: () => { map: { nodes: Record<string, { name: string }> } }) => Object.values(s().map.nodes).map((n) => n.name).sort();

  it("with no copied boxes the key is left to the browser, and the pasted list becomes boxes", async () => {
    const { s, a, onMapKey, onMapPaste } = await plain();
    const preventDefault = vi.fn();
    onMapKey({ ...ctrlV, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    s().select(a);
    const paste = pasteOf("One\nTwo");
    onMapPaste(paste);
    expect(paste.preventDefault).toHaveBeenCalled();
    expect(namesOf(s)).toEqual(["A", "One", "Two"]);
    expect(Object.values(s().map.links).every((l) => l.from === a)).toBe(true);
  });

  it("one line, or a name being typed, is left alone", async () => {
    const { s, a, onMapPaste } = await plain();
    const one = pasteOf("Just one line");
    onMapPaste(one);
    expect(one.preventDefault).not.toHaveBeenCalled();
    s().startEditing({ kind: "box", id: a });
    const typing = pasteOf("One\nTwo");
    onMapPaste(typing);
    expect(typing.preventDefault).not.toHaveBeenCalled();
    expect(namesOf(s)).toEqual(["A"]);
  });

  it("copied boxes come first: the key pastes them, and the text is not read", async () => {
    const { s, a, onMapKey, onMapPaste } = await plain();
    s().copyBoxes([a]);
    const preventDefault = vi.fn();
    onMapKey({ ...ctrlV, preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(namesOf(s)).toEqual(["A", "A"]);
    // Should a paste event arrive anyway, the list is not added on top.
    const paste = pasteOf("One\nTwo");
    onMapPaste(paste);
    expect(paste.preventDefault).not.toHaveBeenCalled();
    expect(namesOf(s)).toEqual(["A", "A"]);
  });
});
