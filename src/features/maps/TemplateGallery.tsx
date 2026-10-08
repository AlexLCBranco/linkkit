import { useMemo, useState } from "react";

import { InlineEditable } from "../../components/InlineEditable";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { displayNames } from "../../domain/names";
import { BUILT_IN_TEMPLATES, builtInMap, savedMap, type SavedTemplate } from "../../domain/templates";
import type { LinkMap } from "../../domain/types";
import { newPageSize, useMapStore } from "../../store/mapStore";
import { useTemplates } from "../../store/templates";
import styles from "./TemplateGallery.module.css";
import { TemplateThumb } from "./TemplateThumb";

/** The page a template's preview is laid out for (only its shape shows). */
const PREVIEW_PAGE = { width: 800, height: 600 };

/**
 * "New from template…": every template as a card with a small picture of
 * its shape. One click on a card makes a new map from it (fresh, ordinary
 * boxes, tidied as it opens) and closes the gallery. The user's own
 * templates ("Save this map as a template") follow the built-in ones, each
 * with "Rename" (the name turns into a field) and a "Remove" that asks
 * once more before it goes.
 */
export function TemplateGallery({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const saved = useTemplates((s) => s.saved);
  // Two templates never show the same name (U13): a repeat shows as "Party 2".
  const shown = useMemo(() => displayNames(saved), [saved]);
  const builtIns = useMemo(() => BUILT_IN_TEMPLATES.map((t) => ({ template: t, preview: builtInMap(t, PREVIEW_PAGE) })), []);

  const start = (make: () => LinkMap | null) => {
    const map = make();
    onOpenChange(false);
    if (map) useMapStore.getState().newFromTemplate(map);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Saved in another tab since? Read fresh each time it opens.
        if (next) useTemplates.getState().reload();
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        // Esc while renaming a template cancels the rename, not the gallery.
        onEscapeKeyDown={(event) => {
          if (event.target instanceof HTMLTextAreaElement) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>New from template</DialogTitle>
          <DialogDescription>Pick one to start a new map from it. Every box can be changed.</DialogDescription>
        </DialogHeader>
        <section className={styles.section}>
          <h3 className={styles.heading}>Ready-made</h3>
          <div className={styles.grid}>
            {builtIns.map(({ template, preview }) => (
              <button
                key={template.id}
                type="button"
                className={styles.card}
                onClick={() => start(() => builtInMap(template, newPageSize()))}
              >
                <TemplateThumb map={preview} />
                <span className={styles.name}>{template.name}</span>
                <span className={styles.blurb}>
                  {template.blurb}
                  {template.kind === "tree" ? " · tree rules on" : ""}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className={styles.section}>
          <h3 className={styles.heading}>Your templates</h3>
          {saved.length === 0 ? (
            <p className={styles.empty}>None yet: open a map and pick “Save this map as a template…” in the map menu.</p>
          ) : (
            <div className={styles.grid}>
              {saved.map((template) => (
                <SavedCard
                  key={template.id}
                  template={template}
                  shown={shown.get(template.id) ?? template.name}
                  onPick={() => start(() => savedMap(template, newPageSize()))}
                />
              ))}
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

function SavedCard({
  template,
  shown,
  onPick,
}: {
  readonly template: SavedTemplate;
  /** Its name as listed: numbered when another template has it too. */
  readonly shown: string;
  readonly onPick: () => void;
}) {
  const preview = useMemo(() => savedMap(template, PREVIEW_PAGE), [template]);
  const [asking, setAsking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  if (!preview) return null;
  return (
    // A div, not a button: the card holds the "Rename" and "Remove" buttons.
    <div
      role="button"
      tabIndex={0}
      className={styles.card}
      onClick={() => !renaming && onPick()}
      onKeyDown={(e) => {
        if (!renaming && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onPick();
        }
      }}
      onMouseLeave={() => setAsking(false)}
    >
      <TemplateThumb map={preview} />
      {renaming ? (
        // Enter or clicking away keeps the name, Esc keeps the old one; a
        // click in the field must not start a map from the card.
        <span onClick={(e) => e.stopPropagation()}>
          <InlineEditable
            value={template.name}
            editing
            onCommit={(name) => useTemplates.getState().rename(template.id, name)}
            onDone={() => setRenaming(false)}
            ariaLabel="Template name"
            className={styles.name}
          />
        </span>
      ) : (
        <span className={styles.name}>{shown || "Untitled"}</span>
      )}
      <span className={styles.blurb}>
        {Object.keys(preview.nodes).length} boxes{preview.kind === "tree" ? " · tree rules on" : ""}
      </span>
      <span className={styles.actions} data-hidden={renaming || undefined}>
        <button
          type="button"
          className={styles.action}
          onClick={(e) => {
            e.stopPropagation();
            setAsking(false);
            setRenaming(true);
          }}
          title="Rename this template"
        >
          Rename
        </button>
        <button
          type="button"
          className={styles.action}
          data-asking={asking || undefined}
          onClick={(e) => {
            e.stopPropagation();
            if (asking) useTemplates.getState().remove(template.id);
            else setAsking(true);
          }}
          title={asking ? "Click again to remove this template" : "Remove this template"}
        >
          {asking ? "Remove?" : "Remove"}
        </button>
      </span>
    </div>
  );
}
