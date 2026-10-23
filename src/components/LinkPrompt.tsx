import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { checkUrl } from "../domain/url";

import styles from "./LinkPrompt.module.css";

interface LinkPromptProps {
  /** Where it opens, in viewport pixels (kept inside the window). */
  readonly x: number;
  readonly y: number;
  /** What the link is for ("Link for box “Milk”"). */
  readonly heading: string;
  /** The link it holds now, to edit; empty for a new one. */
  readonly initial: string;
  /** A checked web address (domain/url.ts). */
  readonly onSave: (url: string) => void;
  readonly onCancel: () => void;
}

/** Clearance kept from the viewport's edges. Layout geometry, not a token. */
const EDGE_MARGIN = 8;

/**
 * The small field a link is typed or pasted into. Enter saves, Escape
 * cancels; a press anywhere outside saves what was typed when it is a
 * link, as every Linkkit field does (owner, 2026-10-21), and otherwise
 * just closes. Only http and https links are kept (`checkUrl`); anything
 * else is refused with a short reason under the field, and the field stays
 * open to fix it.
 *
 * Boardkit's (its `components/LinkPrompt.tsx`), so a link is set the same
 * way everywhere. Portalled to the page and fixed; it stops presses and
 * keys at its edge so they never reach a box's gestures or the map's
 * shortcuts.
 */
export function LinkPrompt({ x, y, heading, initial, onSave, onCancel }: LinkPromptProps) {
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const latest = useRef({ value, onSave, onCancel });
  useLayoutEffect(() => {
    latest.current = { value, onSave, onCancel };
  });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const left = Math.max(EDGE_MARGIN, Math.min(x, window.innerWidth - el.offsetWidth - EDGE_MARGIN));
    const top = Math.max(EDGE_MARGIN, Math.min(y, window.innerHeight - el.offsetHeight - EDGE_MARGIN));
    setPosition({ top, left });
  }, [x, y]);

  // Focus once placed (hidden until then); again a moment later, in case a
  // menu that opened this hands focus back to its trigger as it closes.
  const placed = position !== null;
  useEffect(() => {
    if (!placed) return;
    const focus = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    focus();
    const timer = window.setTimeout(() => {
      if (document.activeElement !== inputRef.current) focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [placed]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      const { value, onSave, onCancel } = latest.current;
      const check = checkUrl(value);
      if (check.ok) onSave(check.url);
      else onCancel();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  function save() {
    const check = checkUrl(value);
    if (check.ok) onSave(check.url);
    else setError(check.reason);
  }

  return createPortal(
    <form
      ref={rootRef}
      className={styles.prompt}
      style={position ?? { top: 0, left: 0, visibility: "hidden" }}
      role="dialog"
      aria-label={heading}
      data-link-prompt=""
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <p className={styles.heading}>{heading}</p>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        inputMode="url"
        spellCheck={false}
        autoComplete="off"
        placeholder="Paste or type a link"
        aria-label="Link"
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p className={styles.hint}>Enter to save · Esc to cancel</p>
      )}
    </form>,
    document.body,
  );
}
