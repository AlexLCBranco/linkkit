import { useEffect } from "react";

import { PALETTE_COLORS } from "../../domain/types";
import type { NodeId } from "../../domain/types";
import { selectionOf, useMapStore } from "../../store/mapStore";
import { BOX_ID_ATTRIBUTE } from "./pageMarkers";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}

/** Focus is in a menu or dialog, which owns the keyboard (arrows, Enter,
    Esc) -- Delete there must never delete a box behind it. */
function inOverlay(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('[role="menu"], [role="dialog"], [role="alertdialog"]') !== null
  );
}

/** The box whose React Flow wrapper has keyboard focus (Tab reaches
    boxes), if that is where the key was pressed. */
function focusedBox(target: EventTarget | null): NodeId | null {
  if (!(target instanceof HTMLElement) || !target.classList.contains("react-flow__node")) return null;
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
 * On the selected box, or every box of a group:
 *   Delete, Backspace          delete (with their arrows)
 *   1-8, 0                     set a palette colour; 0 clears it
 *   Ctrl/Cmd+C, X, D           copy, cut, duplicate (not in a tree)
 *
 * All ignored while typing a name or label, so the field's own undo and
 * Backspace keep working. Reads the store with `getState()` inside the
 * handler, so the listener is attached once and never re-renders anything.
 */
export function useMapShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target) || inOverlay(e.target) || e.altKey) return;
      const store = useMapStore.getState();
      const key = e.key.toLowerCase();

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
      if (key === "enter") {
        const box = focusedBox(e.target);
        if (box && !store.editing) {
          e.preventDefault();
          store.select(box);
        }
        return;
      }

      const picked = selectionOf(store);
      if (picked.length === 0 || store.editing) return;
      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        store.deleteBoxes(picked);
      } else if (/^[0-8]$/.test(key)) {
        // 1-8 pick a palette colour in its listed order; 0 clears it.
        const index = Number(key);
        store.setBoxesColor(picked, index === 0 ? null : PALETTE_COLORS[index - 1]);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
