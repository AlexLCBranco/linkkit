/**
 * Every keyboard shortcut Linkkit has, in one table. The key handlers
 * (`features/map/useMapShortcuts.ts`, and `components/InlineEditable.tsx`
 * for the keys while typing) ask this table "was that the undo key?", and
 * the shortcuts dialog lists the same table, so the two can't drift apart.
 * `keyboard.test.ts` checks it: every key the map reacts to is in here.
 */

/** One key press that triggers a shortcut. `key` is the browser's
    `KeyboardEvent.key`, lower-cased ("z", "enter", " ", "arrowup").
    `mod` is Ctrl (Windows) or ⌘ (Mac). `shift` left out: either way. */
export interface KeyCombo {
  readonly key: string;
  readonly mod?: boolean;
  readonly shift?: boolean;
}

export type ShortcutGroup = "Create & edit" | "Move around" | "Organise" | "View" | "Undo";

export interface Shortcut {
  readonly group: ShortcutGroup;
  /** What it does, as the dialog says it. */
  readonly does: string;
  /** Alternative presses, any of which does it. */
  readonly combos: readonly KeyCombo[];
  /** Works only in a tree map, or only outside one. Left out: any map. */
  readonly only?: "tree" | "not-tree";
  /** Only while typing a name or label (the map's own keys are off then). */
  readonly typing?: boolean;
}

const k = (key: string, extra: Omit<KeyCombo, "key"> = {}): KeyCombo => ({ key, ...extra });
const digits = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => k(String(from + i)));

export const SHORTCUTS = {
  // Create & edit
  addNextStep: {
    group: "Create & edit",
    does: "Add a child under the selected box (Tab again goes one deeper)",
    combos: [k("tab", { shift: false })],
    only: "tree",
  },
  rename: { group: "Create & edit", does: "Rename the selected box", combos: [k("enter"), k("f2")] },
  save: { group: "Create & edit", does: "Keep the name or label", combos: [k("enter")], typing: true },
  newLine: { group: "Create & edit", does: "Start a new line in a box's name", combos: [k("enter", { shift: true })], typing: true },
  cancel: {
    group: "Create & edit",
    does: "Cancel the typing (a new, still blank box goes away)",
    combos: [k("escape")],
    typing: true,
  },
  notes: { group: "Create & edit", does: "Open the selected box's notes", combos: [k("n")] },
  delete: {
    group: "Create & edit",
    does: "Delete the selected boxes, or the picked arrow",
    combos: [k("delete"), k("backspace")],
  },
  copy: { group: "Create & edit", does: "Copy the selected boxes", combos: [k("c", { mod: true })], only: "not-tree" },
  cut: { group: "Create & edit", does: "Cut the selected boxes", combos: [k("x", { mod: true })], only: "not-tree" },
  paste: { group: "Create & edit", does: "Paste", combos: [k("v", { mod: true })], only: "not-tree" },
  duplicate: {
    group: "Create & edit",
    does: "Duplicate the selected boxes",
    combos: [k("d", { mod: true })],
    only: "not-tree",
  },
  // Move around
  move: {
    group: "Move around",
    does: "Move the selection: up to the parent, down to a child, along the row to a sibling",
    combos: [k("arrowup", { shift: false }), k("arrowdown", { shift: false }), k("arrowleft", { shift: false }), k("arrowright", { shift: false })],
    only: "tree",
  },
  selectFocused: { group: "Move around", does: "Select the box Tab has reached", combos: [k("enter")] },
  selectAll: { group: "Move around", does: "Select every box", combos: [k("a", { mod: true })] },
  clearSelection: { group: "Move around", does: "Clear the selection", combos: [k("escape")] },
  // Organise
  colour: { group: "Organise", does: "Colour the selected boxes (in the palette's order)", combos: digits(1, 8) },
  clearColour: { group: "Organise", does: "Clear their colour", combos: [k("0")] },
  toggleCut: { group: "Organise", does: "Mark cut, or un-cut", combos: [k("x", { shift: false })], only: "tree" },
  toggleCollapsed: { group: "Organise", does: "Collapse or expand the selected box's branch", combos: [k(" ")], only: "tree" },
  // View
  help: { group: "View", does: "Show these shortcuts", combos: [k("?")] },
  // Undo
  undo: { group: "Undo", does: "Undo", combos: [k("z", { mod: true, shift: false })] },
  redo: { group: "Undo", does: "Redo", combos: [k("z", { mod: true, shift: true }), k("y", { mod: true })] },
} as const satisfies Record<string, Shortcut>;

export type ShortcutId = keyof typeof SHORTCUTS;

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ["Create & edit", "Move around", "Organise", "View", "Undo"];

/** The parts of a key press a combo is matched against. */
export interface PressedKeys {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export function comboMatches(press: PressedKeys, combo: KeyCombo): boolean {
  return (
    press.key.toLowerCase() === combo.key &&
    (press.ctrlKey || press.metaKey) === (combo.mod ?? false) &&
    (combo.shift === undefined || combo.shift === press.shiftKey)
  );
}

/** Whether this key press is shortcut `id` (any of its combos). */
export const pressed = (press: PressedKeys, id: ShortcutId): boolean =>
  SHORTCUTS[id].combos.some((combo) => comboMatches(press, combo));

const CAPS: Record<string, string> = {
  " ": "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  delete: "Del",
  escape: "Esc",
  enter: "Enter",
  tab: "Tab",
  backspace: "Backspace",
};

const capOf = (key: string): string => CAPS[key] ?? key.toUpperCase();

/** The keycaps the dialog draws for a combo: ["Ctrl", "Shift", "Z"] (on a
    Mac, ["⌘", "Shift", "Z"]). */
export function capsOf(combo: KeyCombo, mac: boolean): string[] {
  return [...(combo.mod ? [mac ? "⌘" : "Ctrl"] : []), ...(combo.shift ? ["Shift"] : []), capOf(combo.key)];
}

/** Every combo of a shortcut as keycaps; a run of plain digits ("1" to
    "8") reads as one "1–8". */
export function shortcutCaps(shortcut: Shortcut, mac: boolean): string[][] {
  const { combos } = shortcut;
  const allDigits = combos.length > 2 && combos.every((c) => /^[0-9]$/.test(c.key) && !c.mod && !c.shift);
  if (allDigits) return [[`${combos[0].key}–${combos[combos.length - 1].key}`]];
  return combos.map((combo) => capsOf(combo, mac));
}
