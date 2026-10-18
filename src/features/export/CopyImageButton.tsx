import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { useMapStore } from "../../store/mapStore";
import styles from "../map/HeaderButton.module.css";
import { copyPngToClipboard, renderMapPngForCopy } from "./renderMapImage";

/**
 * Copies the whole map to the clipboard as a picture (Boardkit's "Copy
 * board as image"): the same clean image as "Export PNG image", at 4x the
 * pixels, so it can be pasted into Excalidraw and resized there without
 * going soft. The icon turns to a tick (or a warning) for a moment.
 */
export function CopyImageButton() {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    const copied = await copyPngToClipboard(renderMapPngForCopy(useMapStore.getState().map));
    setState(copied ? "copied" : "error");
    setTimeout(() => setState("idle"), 1500);
  }

  const Icon = state === "copied" ? Check : state === "error" ? TriangleAlert : Copy;
  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => void copy()}
      title="Copy the whole map as an image (sharp enough to resize after pasting)"
    >
      <Icon size={16} />
      <span className={styles.word}>{state === "copied" ? "Copied" : "Copy image"}</span>
    </button>
  );
}
