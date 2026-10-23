import type { NodeId } from "../../domain/types";
import { useLinkPrompt } from "../../store/linkPrompt";
import { BOX_ID_ATTRIBUTE } from "./pageMarkers";

/** Opens box `id`'s link field just under the box on screen (or in the
    window's top-left quarter when it isn't drawn). */
export function openLinkPromptFor(id: NodeId): void {
  const box = typeof document === "undefined" ? null : document.querySelector(`[${BOX_ID_ATTRIBUTE}="${CSS.escape(id)}"]`);
  const r = box?.getBoundingClientRect();
  useLinkPrompt.getState().open(id, r ? { x: r.left, y: r.bottom + 6 } : { x: globalThis.innerWidth / 4 || 0, y: globalThis.innerHeight / 4 || 0 });
}
