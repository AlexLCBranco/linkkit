import { useEffect } from "react";

import { isArrowKey } from "../../domain/navigation";
import { pressed, type ShortcutId } from "../../domain/shortcuts";
import { PALETTE_COLORS } from "../../domain/types";
import type { NodeId } from "../../domain/types";
import { selectionOf, useMapStore } from "../../store/mapStore";
import { useShortcutsDialog } from "../../store/shortcutsDialog";
import { BOX_ID_ATTRIBUTE, MAP_VIEW_ATTRIBUTE } from "./pageMarkers";

/** What the handler reads from a key press: a `KeyboardEvent` has it all,
    and a test can hand in a plain object. */
export interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly target: EventTarget | null;
  preventDefault(): void;
}

const isElement = (target: EventTarget | null): target is HTMLElement =>
  typeof HTMLElement !== "undefined" && target instanceof HTMLElement;

function isTyping(target: EventTarget | null): boolean {
  return isElement(target) && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA");
}

/** Focus is in a menu or dialog, which owns the keyboard (arrows, Enter,
    Esc) -- Delete there must never delete a box behind it. */
function inOverlay(target: EventTarget | null): boolean {
  return isElement(target) && target.closest('[role="menu"], [role="dialog"], [role="alertdialog"]') !== null;
}

/** Focus is on the map (or nowhere): Tab, Enter and the arrows act on boxes
    only then. On a header button, Tab must move focus and Enter press it. */
function onCanvas(target: EventTarget | null): boolean {
  if (!isElement(target)) return true;
  return target === document.body || target.closest(`.react-flow, [${MAP_VIEW_ATTRIBUTE}]`) !== null;
}

/** The box whose React Flow wrapper has keyboard focus (Tab reaches
    boxes), if that is where the key was pressed. */
function focusedBox(target: EventTarget | null): NodeId | null {
  if (!isElement(target) || !target.classList.contains("react-flow__node")) return null;
  const id = target.querySelector(`[${BOX_ID_ATTRIBUTE}]`)?.getAttribute(BOX_ID_ATTRIBUTE);
  return id ? (id as NodeId) : null;
}

/**
 * The map's keyboard extras (every one also has a mouse way). Which key
 * does what is in `domain/shortcuts.ts`, the table the shortcuts dialog
 * lists; this decides when each one applies (a box selected, a tree, focus
 * on the map).
 *
 * All ignored while typing a name or label, so the field's own undo and
 * Backspace keep working. Reads the store with `getState()`, so the
 * listener is attached once and never re-renders anything.
 */
export function onMapKey(e: KeyPress): void {
  if (isTyping(e.target) || inOverlay(e.target) || e.altKey) return;
  const store = useMapStore.getState();
  const is = (id: ShortcutId) => pressed(e, id);
  const isTree = store.map.kind === "tree";

  if (e.ctrlKey || e.metaKey) {
    if (is("undo")) {
      e.preventDefault();
      store.undo();
    } else if (is("redo")) {
      e.preventDefault();
      store.redo();
    } else if (is("selectAll") && !store.editing) {
      e.preventDefault();
      store.selectAll();
    } else if (is("paste") && !store.editing) {
      e.preventDefault();
      store.paste();
    } else if ((is("copy") || is("cut") || is("duplicate")) && !store.editing) {
      const picked = selectionOf(store);
      if (picked.length === 0) return;
      e.preventDefault();
      if (is("copy")) store.copyBoxes(picked);
      else if (is("cut")) store.cutBoxes(picked);
      else store.duplicateBoxes(picked);
    }
    return;
  }

  if (is("clearSelection")) return store.select(null);
  if (is("help")) {
    e.preventDefault();
    useShortcutsDialog.getState().setOpen(true);
    return;
  }

  // One box selected, keys on the map: Treekit's keyboard flow.
  const one = store.group.length === 0 ? store.selected : null;
  if (is("rename") || is("selectFocused")) {
    if (store.editing || !onCanvas(e.target)) return;
    const box = is("selectFocused") ? focusedBox(e.target) : null;
    if (box && box !== one) {
      e.preventDefault();
      store.select(box);
    } else if (one) {
      e.preventDefault();
      store.startEditing({ kind: "box", id: one });
    }
    return;
  }
  if (isTree && is("addNextStep") && one && !store.editing && onCanvas(e.target)) {
    e.preventDefault();
    store.addNextStep(one);
    return;
  }
  if (isTree && is("move") && isArrowKey(e.key) && !store.editing && onCanvas(e.target)) {
    // Also stops the page scrolling.
    e.preventDefault();
    store.moveSelection(e.key);
    return;
  }

  const picked = selectionOf(store);
  if (store.selectedLink && picked.length === 0 && !store.editing && is("delete")) {
    e.preventDefault();
    store.deleteLink(store.selectedLink);
    return;
  }
  if (picked.length === 0 || store.editing) return;
  if (is("delete")) {
    e.preventDefault();
    store.deleteBoxes(picked);
  } else if (is("colour") || is("clearColour")) {
    // 1-8 pick a palette colour in its listed order; 0 clears it.
    const index = Number(e.key);
    store.setBoxesColor(picked, index === 0 ? null : PALETTE_COLORS[index - 1]);
  } else if (is("toggleCut") && isTree) {
    store.toggleCut(picked);
  } else if (is("notes") && picked.length === 1) {
    // Otherwise the "n" would be typed into the notes as they open.
    e.preventDefault();
    store.openNotes(picked[0]);
  } else if (is("toggleCollapsed") && isTree && !(isElement(e.target) && e.target.tagName === "BUTTON")) {
    // Not the page scrolling down. (On a focused button, Space presses
    // the button instead.)
    e.preventDefault();
    store.toggleCollapsed(picked);
  }
}

export function useMapShortcuts() {
  useEffect(() => {
    document.addEventListener("keydown", onMapKey);
    return () => document.removeEventListener("keydown", onMapKey);
  }, []);
}
