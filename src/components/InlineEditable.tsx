import { useRef, useState } from "react";

import styles from "./InlineEditable.module.css";

interface InlineEditableProps {
  readonly value: string;
  /** Controlled by the parent: on a canvas, what opens an edit (double-click,
      Enter, "Add box") is decided outside this field. */
  readonly editing: boolean;
  readonly onCommit: (value: string) => void;
  /** Called when editing ends: `committed` false when it was cancelled
      (Esc). */
  readonly onDone: (committed: boolean) => void;
  readonly ariaLabel: string;
  readonly placeholder?: string;
  readonly className?: string;
  /** Several lines pasted (one line pastes as usual): the pasted text and
      the typed text either side of it. Typing ends with it. */
  readonly onPasteLines?: (text: string, before: string, after: string) => void;
}

/**
 * Click-to-edit text, copied from Treekit (which adapted Boardkit's). Generic:
 * it knows nothing about maps. Enter commits (names and labels are one
 * line; long ones wrap on screen), Esc cancels, clicking away commits.
 *
 * The edit field is its own component, mounted only while editing. Its
 * draft starts from `value` on mount, so every edit begins fresh with no
 * effect needed to reset it.
 */
export function InlineEditable({ value, editing, className, placeholder, ...rest }: InlineEditableProps) {
  if (editing) {
    return <EditField value={value} className={className} placeholder={placeholder} {...rest} />;
  }
  return (
    <span className={[styles.display, !value && styles.placeholder, className].filter(Boolean).join(" ")}>
      {value || placeholder}
    </span>
  );
}

/**
 * The textarea. Draft is local state, not store state: it is transient and
 * belongs to one field, and writing every keystroke to Zustand would
 * re-render every subscriber.
 *
 * Autosizing uses Boardkit's pure-CSS trick: an invisible `::after` in the
 * same grid cell mirrors the text via `attr(data-value)`, so the field grows
 * with no measuring code.
 *
 * `nodrag nopan nowheel` are React Flow's opt-out classes: inside the field,
 * a press places the caret instead of panning the canvas.
 */
function EditField({
  value,
  onCommit,
  onDone,
  ariaLabel,
  placeholder,
  className,
  onPasteLines,
}: Omit<InlineEditableProps, "editing">) {
  const [draft, setDraft] = useState(value);
  // Set once the edit has ended, so the blur that follows Enter/Esc (as the
  // textarea unmounts) does not commit a second time.
  const finishedRef = useRef(false);

  function finish(commit: boolean) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const trimmed = draft.trim();
    if (commit && trimmed !== value) onCommit(trimmed);
    onDone(commit);
  }

  return (
    <span
      className={[styles.autosize, className].filter(Boolean).join(" ")}
      data-value={draft || placeholder || " "}
    >
      <textarea
        // Focus and select-all on mount, so typing replaces the old title.
        ref={(el) => {
          if (el && !finishedRef.current && document.activeElement !== el) {
            el.focus();
            el.select();
            // Not focusable yet (still hidden while it is measured): once
            // more on the next frame.
            if (document.activeElement !== el) {
              requestAnimationFrame(() => {
                if (finishedRef.current || !el.isConnected || document.activeElement === el) return;
                el.focus();
                el.select();
              });
            }
          }
        }}
        className={`${styles.textarea} nodrag nopan nowheel`}
        value={draft}
        rows={1}
        // Its own width stays tiny, so the hidden mirror text alone decides
        // how wide a fit-to-content box grows while typing.
        cols={1}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text/plain");
          if (!onPasteLines || text.split("\n").filter((line) => line.trim()).length < 2) return;
          event.preventDefault();
          const field = event.currentTarget;
          finishedRef.current = true;
          onPasteLines(text, draft.slice(0, field.selectionStart), draft.slice(field.selectionEnd));
          onDone(true);
        }}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          // Keep every key local: canvas shortcuts (Delete = delete the box)
          // must not fire while typing.
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            finish(false);
          }
        }}
        aria-label={ariaLabel}
      />
    </span>
  );
}
