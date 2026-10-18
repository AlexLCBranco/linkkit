import { readToFrame, type EmbedStatus } from "../domain/embed";
import { MAP_VIEW_ATTRIBUTE } from "../features/map/pageMarkers";
import { embedded, useEmbedStatus } from "../store/embed";
import { useMapStore } from "../store/mapStore";
import { flushSave } from "../store/saveQueue";

/**
 * The frame's side of the canvas protocol (`domain/embed.ts`): says it is
 * ready and how its map stands, reports where it is scrolled (so the canvas
 * can put it back after unloading the frame), and on "flush" saves at once
 * and says whether something is being typed (the canvas then keeps the frame
 * loaded, so an edit in progress is never lost).
 */
const APP = "linkkit";
const SCROLL_REPORT_MS = 150;

const scroller = () => document.querySelector<HTMLElement>(`[${MAP_VIEW_ATTRIBUTE}]`);

export function initEmbedBridge(): void {
  const embed = embedded();
  if (!embed || window.parent === window) return;
  const id = embed.id;
  const post = (message: Record<string, unknown>) => window.parent.postMessage({ app: APP, id, ...message }, window.location.origin);

  post({ type: "stone:ready", status: useEmbedStatus.getState().status });
  useEmbedStatus.subscribe((s, prev) => {
    if (s.status !== prev.status) post({ type: "stone:status", status: s.status satisfies EmbedStatus });
  });

  let reportTimer: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener(
    "scroll",
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || !el.hasAttribute(MAP_VIEW_ATTRIBUTE)) return;
      clearTimeout(reportTimer);
      reportTimer = setTimeout(() => post({ type: "stone:scroll", x: el.scrollLeft, y: el.scrollTop }), SCROLL_REPORT_MS);
    },
    true,
  );

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const message = readToFrame(event.data);
    if (!message) return;
    if (message.type === "stone:flush") {
      flushSave();
      post({ type: "stone:flushed", busy: typing() });
      return;
    }
    scrollWhenReady(message.x, message.y);
  });
}

/** A name being edited, or the focus in any text field (a note, a search):
    unloading now would lose the draft or the place in it. */
function typing(): boolean {
  if (useMapStore.getState().editing !== null) return true;
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
}

/** The map's scrolling area appears once the map has been drawn (and
    tidied); until then the request waits, for up to two seconds. */
function scrollWhenReady(x: number, y: number, tries = 120): void {
  const el = scroller();
  if (el && el.hasAttribute("data-ready")) {
    el.scrollTo({ left: x, top: y });
    return;
  }
  if (tries > 0) requestAnimationFrame(() => scrollWhenReady(x, y, tries - 1));
}
