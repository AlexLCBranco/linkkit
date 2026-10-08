import { Download } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { toMermaid } from "../../domain/mermaid";
import { useMapStore } from "../../store/mapStore";
import { useSyncNotice } from "../../store/syncNotice";
import styles from "../map/HeaderButton.module.css";
import { downloadHref, downloadText, fileStem } from "./download";
import { ImportMermaidDialog } from "./ImportMermaidDialog";
import { renderMapImage, type ImageFormat } from "./renderMapImage";

const say = (text: string) => useSyncNotice.getState().say(text);

/**
 * Header menu (Treekit's export menu): save the open map as an image or as
 * Mermaid text, or import Mermaid. Works for every map, tree rules on or
 * off. Everything is read from the store at click time (`getState`), not
 * subscribed to, so the menu never re-renders while you edit.
 */
export function ExportMenu() {
  const [importing, setImporting] = useState(false);

  async function saveImage(format: ImageFormat) {
    const { map } = useMapStore.getState();
    try {
      downloadHref(await renderMapImage(map, format), `${fileStem(map.name)}.${format}`);
    } catch (error) {
      console.error("Image export failed", error);
      say("Couldn't create the image.");
    }
  }

  async function copyMermaid() {
    try {
      await navigator.clipboard.writeText(toMermaid(useMapStore.getState().map));
      say("Mermaid copied.");
    } catch {
      say("Couldn't copy; use “Download Mermaid” instead.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={styles.button} title="Export as an image or Mermaid, or import Mermaid">
            <Download size={16} />
            <span className={styles.word}>Export</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onSelect={() => void saveImage("png")}>Export PNG image</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void saveImage("svg")}>Export SVG image</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void copyMermaid()}>Copy as Mermaid</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              const { map } = useMapStore.getState();
              downloadText(toMermaid(map), `${fileStem(map.name)}.mmd`);
            }}
          >
            Download Mermaid (.mmd)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setImporting(true)}>Import Mermaid…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ImportMermaidDialog open={importing} onOpenChange={setImporting} />
    </>
  );
}
