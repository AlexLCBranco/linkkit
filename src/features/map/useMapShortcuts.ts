import { useEffect } from "react";

import { isArrowKey } from "../../domain/navigation";
import { PALETTE_COLORS } from "../../domain/types";
import type { NodeId } from "../../domain/types";
import { selectionOf, useMapStore } from "../../store/mapStore";
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
 * The map's keyboard extras (every one also has a mouse way):
 *
 *   Ctrl/Cmd+Z                 undo
 *   Ctrl/Cmd+Shift+Z, Ctrl+Y   redo
 *   Ctrl/Cmd+A                 select every box
 *   Ctrl/Cmd+V                 paste what was copied
 *   Esc                        clear the selection
 *   Enter on a focused box     select it (as in the prototype)
 *   Delete, Backspace          delete the picked arrow (a click on its line)
 * On the selected box:
 *   Enter, F2                  rename it
 * In a tree (Treekit's keys; mind-map tools use the same Tab / Enter):
 *   Tab                        add a next step under the selected box (it
 *                              opens for typing, and stays selected after,
 *                              so Tab again goes one deeper)
 *   Arrows                     up to a parent, down to a next step, along
 *                              the row (turned in a left-right tree); with
 *                              nothing selected, the start
 * On the selected box, or every box of a group:
 *   Delete, Backspace          delete (with their arrows)
 *   1-8, 0                     set a palette colour; 0 clears it
 *   X                          cut, or uncut (a tree's steps)
 *   N                          open its notes (one box)
 *   Space                      collapse, or expand (a tree's branches)
 *   Ctrl/Cmd+C, X, D           copy, cut, duplicate (not in a tree)
 *
 * All ignored while typing a name or label, so the field's own undo and
 * Backspace keep working. Reads the store with `getState()`, so the
 * listener is attached once and never re-renders anything.
 */
export function onMapKey(e: KeyPress): void {
  if (isTyping(e.target) || inOverlay(e.target) || e.altKey) return;
  const store = useMapStore.getState();
  const key = e.key.toLowerCase();
  const isTree = store.map.kind === "tree";

  if (e.ctrlKey || e.metaKey) {
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      store.undo();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      store.redo();
    } else if (key === "a" && !store.editing) {
      e.preventDefault();
      store.selectAll();
    } else if (key === "v" && !store.editing) {
      e.preventDefault();
      store.paste();
    } else if ((key === "c" || key === "x" || key === "d") && !store.editing) {
      const picked = selectionOf(store);
      if (picked.length === 0) return;
      e.preventDefault();
      if (key === "c") store.copyBoxes(picked);
      else if (key === "x") store.cutBoxes(picked);
      else store.duplicateBoxes(picked);
    }
    return;
  }

  if (key === "escape") return store.select(null);

  // One box selected, keys on the map: Treekit's keyboard flow.
  const one = store.group.length === 0 ? store.selected : null;
  if (key === "enter" || key === "f2") {
    if (store.editing || !onCanvas(e.target)) return;
    const box = key === "enter" ? focusedBox(e.target) : null;
    if (box && box !== one) {
      e.preventDefault();
      store.select(box);
    } else if (one) {
      e.preventDefault();
      store.startEditing({ kind: "box", id: one });
    }
    return;
  }
  if (isTree && key === "tab" && !e.shiftKey && one && !store.editing && onCanvas(e.target)) {
    e.preventDefault();
    store.addNextStep(one);
    return;
  }
  if (isTree && isArrowKey(e.key) && !e.shiftKey && !store.editing && onCanvas(e.target)) {
    // Also stops the page scrolling.
    e.preventDefault();
    store.moveSelection(e.key);
    return;
  }

  const picked = selectionOf(store);
  if (store.selectedLink && picked.length === 0 && !store.editing && (key === "delete" || key === "backspace")) {
    e.preventDefault();
    store.deleteLink(store.selectedLink);
    return;
  }
  if (picked.length === 0 || store.editing) return;
  if (key === "delete" || key === "backspace") {
    e.preventDefault();
    store.deleteBoxes(picked);
  } else if (/^[0-8]$/.test(key)) {
    // 1-8 pick a palette colour in its listed order; 0 clears it.
    const index = Number(key);
    store.setBoxesColor(picked, index === 0 ? null : PALETTE_COLORS[index - 1]);
  } else if (key === "x" && !e.shiftKey) {
    store.toggleCut(picked);
  } else if (key === "n" && picked.length === 1) {
    // Otherwise the "n" would be typed into the notes as they open.
    e.preventDefault();
    store.openNotes(picked[0]);
  } else if (key === " " && isTree && !(isElement(e.target) && e.target.tagName === "BUTTON")) {
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
