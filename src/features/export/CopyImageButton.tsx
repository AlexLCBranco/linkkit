import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { useMapStore } from "../../store/mapStore";
import { useSyncNotice } from "../../store/syncNotice";
import styles from "../map/HeaderButton.module.css";
import { renderMapPngForCopy } from "./renderMapImage";

/**
 * Copies the whole map to the clipboard as a picture (Boardkit's "Copy
 * board as image"): the same clean image as "Export PNG image", at 4x the
 * pixels, so it can be pasted into Excalidraw and resized there without
 * going soft. The icon turns to a tick (or a warning) for a moment.
 */
export function CopyImageButton() {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      // The clipboard is handed the picture still being drawn (a promise),
      // so Safari counts the write as part of the click.
      const png = renderMapPngForCopy(useMapStore.getState().map);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setState("copied");
    } catch (error) {
      console.error("Copy image failed", error);
      setState("error");
      useSyncNotice.getState().say("Couldn't copy the image; use Export > Export PNG image instead.");
    } finally {
      setTimeout(() => setState("idle"), 1500);
    }
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
