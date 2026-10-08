import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { templateName } from "../../domain/templates";
import { useMapStore } from "../../store/mapStore";
import { useTemplates } from "../../store/templates";
import styles from "./SaveTemplateDialog.module.css";

/**
 * "Save this map as a template" (U13): a small name field, filled with the
 * map's name and selected, so Enter saves it as is and typing replaces it.
 * Esc (or Cancel, or clicking outside) saves nothing. A name another
 * template already has is numbered ("Party 2") by the store.
 */
export function SaveTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so each time starts from the map's name. */}
      {open && <NameForm onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function NameForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(() => templateName(useMapStore.getState().map));
  return (
    <DialogContent
      showCloseButton={false}
      // Radix would focus the field anyway; selecting it too means typing
      // replaces the name.
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        const field = (event.currentTarget as HTMLElement).querySelector("input");
        field?.focus();
        field?.select();
      }}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          useTemplates.getState().save(useMapStore.getState().map, name);
          onDone();
        }}
      >
        <DialogHeader>
          <DialogTitle>Save as a template</DialogTitle>
        </DialogHeader>
        <input
          className={styles.field}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Template name"
          placeholder="Template name"
          maxLength={200}
        />
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Save
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
