import { create } from "zustand";

import { templatesToRestore } from "../domain/backup";
import { createMapId } from "../domain/ids";
import { readTemplates, serializeTemplates, templateOf, type SavedTemplate } from "../domain/templates";
import type { LinkMap } from "../domain/types";
import { useSyncNotice } from "./syncNotice";

/** Where saved templates live, beside the maps (every Linkkit key starts
    with "linkkit:"). */
const TEMPLATES_KEY = "linkkit:templates";

/** The saved templates as stored now (another tab may have added one). */
export function loadTemplates(): SavedTemplate[] {
  return load();
}

function load(): SavedTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? readTemplates(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function store(templates: readonly SavedTemplate[]): boolean {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(serializeTemplates(templates)));
    return true;
  } catch {
    return false;
  }
}

/**
 * The user's own templates ("Save this map as a template"), kept in the
 * browser like maps. Read fresh whenever the gallery opens, so a template
 * saved in another tab shows too. A save that fails says so.
 */
export const useTemplates = create<{
  saved: readonly SavedTemplate[];
  reload: () => void;
  save: (map: LinkMap) => void;
  remove: (id: string) => void;
  /** Adds the templates from a backup that aren't here yet; how many. */
  restore: (incoming: readonly SavedTemplate[]) => number;
}>()((set) => ({
  saved: load(),
  reload: () => set({ saved: load() }),
  save: (map) => {
    const template = templateOf(map, createMapId(), Date.now());
    const next = [...load(), template];
    const say = useSyncNotice.getState().say;
    if (!store(next)) {
      say("The template couldn't be saved: the browser's storage is full.");
      return;
    }
    set({ saved: next });
    say(`Saved “${template.name}” as a template: it is under “New from template…”.`);
  },
  restore: (incoming) => {
    const now = load();
    const add = templatesToRestore(now, incoming);
    if (add.length === 0 || !store([...now, ...add])) return 0;
    set({ saved: [...now, ...add] });
    return add.length;
  },
  remove: (id) => {
    const next = load().filter((t) => t.id !== id);
    if (store(next)) set({ saved: next });
  },
}));
