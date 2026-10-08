import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { layoutMap } from "../../domain/layout";
import { fromMermaid } from "../../domain/mermaid";
import { placeOnPage } from "../../domain/page";
import type { LinkMap, NodeId, Size } from "../../domain/types";
import { newPageSize, useMapStore } from "../../store/mapStore";
import { useSyncNotice } from "../../store/syncNotice";
import { useViewStore } from "../../store/viewStore";
import { layoutOptions, PAGE_MARGIN } from "../map/layoutConfig";

const PLACEHOLDER = `flowchart TD
    A[Start] --> B{Choice}
    B -->|yes| C[Do it]
    B -->|no| D[Skip it]`;

/** About how big a box with this name is drawn (one line per ~24
    characters, up to the box's widest): good enough to lay out a map that
    isn't on screen to be measured. "Tidy up" tidies it with real sizes. */
function guessSize(name: string): Size {
  const chars = Math.max(name.length, 8);
  const lines = Math.ceil(chars / 24);
  return { width: Math.min(220, chars * 8 + 26), height: 18 * lines + 26 };
}

/** `map` tidied with guessed box sizes, on a window-sized page. */
function roughlyPlaced(map: LinkMap): LinkMap {
  const sizes = new Map(Object.values(map.nodes).map((n) => [n.id, guessSize(n.name)] as [NodeId, Size]));
  const labels = new Map(Object.values(map.links).map((l) => [l.id, l.label ? guessSize(l.label) : { width: 0, height: 0 }]));
  const layout = layoutMap(map, sizes, layoutOptions(map.arrowLength, map.direction, labels, map.kind));
  const placed = placeOnPage(layout, newPageSize(), PAGE_MARGIN, useViewStore.getState().alignment);
  const nodes = { ...map.nodes };
  for (const [id, at] of placed.positions) nodes[id] = { ...nodes[id], x: at.x, y: at.y };
  return { ...map, nodes, page: placed.page };
}

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Paste Mermaid flowchart text (Treekit's "Import Mermaid"): each tree in
 * it becomes a new map with tree rules on, and anything that breaks tree
 * rules one map with them off (`domain/mermaid.ts`). The open map is never
 * touched. The first new map opens, tidied; the rest wait in the map menu,
 * laid out with guessed box sizes. Text that can't be read stays in the
 * box with the reason underneath, to fix and retry. What couldn't come
 * across is said once imported.
 */
export function ImportMermaidDialog({ open, onOpenChange }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setText("");
      setError(null);
    }
  }

  function submit() {
    const { maps: taken, importMaps } = useMapStore.getState();
    const result = fromMermaid(text, newPageSize(), taken.map((m) => m.name));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const [first, ...rest] = result.maps;
    importMaps([first, ...rest.map(roughlyPlaced)]);
    const count = result.maps.length;
    const others = count > 1 ? `Imported ${count} maps; the others are in the map menu.` : "";
    const said = [others, ...result.warnings].filter(Boolean).join(" ");
    if (said) useSyncNotice.getState().say(said);
    close(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Mermaid</DialogTitle>
          <DialogDescription>
            Paste a flowchart. Each tree in it opens as a new map; your current map is left alone.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          aria-label="Mermaid flowchart"
          aria-invalid={error !== null}
          className="h-56 w-full resize-none rounded-lg border border-input bg-transparent p-2.5 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!text.trim()}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
