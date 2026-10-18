import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { NodeId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { copyPngToClipboard, renderMapPngForCopy } from "./renderMapImage";

/** A "copy as image" button's click and look: the map (or just `only`'s
    boxes) goes on the clipboard as a 4x PNG, and the icon turns to a tick
    (or a warning) for a moment. Shared by the header's "Copy image" and
    the selection bar's. */
export function useCopyImage() {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copy(only: readonly NodeId[] | null = null) {
    const copied = await copyPngToClipboard(renderMapPngForCopy(useMapStore.getState().map, only));
    setState(copied ? "copied" : "error");
    setTimeout(() => setState("idle"), 1500);
  }

  const Icon = state === "copied" ? Check : state === "error" ? TriangleAlert : Copy;
  return { copy, copied: state === "copied", Icon };
}
