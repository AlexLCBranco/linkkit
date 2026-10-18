import { toBlob, toPng, toSvg } from "html-to-image";
import type { LucideIcon } from "lucide-react";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import inlineStyles from "../../components/InlineEditable.module.css";
import { champion, playerName } from "../../domain/bracket";
import { bracketDecor } from "../../domain/bracketLayout";
import { headPath, roundedPath } from "../../domain/arrows";
import { imageLayout } from "../../domain/imageLayout";
import { pickedMap } from "../../domain/map";
import { arrowsInto } from "../../domain/rules";
import { shownMap } from "../../domain/shown";
import { looksCut } from "../../domain/status";
import type { LinkId, LinkMap, NodeId, Size } from "../../domain/types";
import boxStyles from "../map/BoxView.module.css";
import decorStyles from "../map/BracketDecor.module.css";
import matchStyles from "../map/MatchBox.module.css";
import edgeStyles from "../map/LinkEdgeView.module.css";
import { BRACKET_DECOR, LABELS, ROUTES } from "../map/layoutConfig";
import { STATUS_META } from "../map/statusMeta";
import { useSyncNotice } from "../../store/syncNotice";

/** Empty space around the map, in CSS pixels (Treekit's). */
const MARGIN = 40;
const SVG_NS = "http://www.w3.org/2000/svg";

export type ImageFormat = "png" | "svg";

/** A lucide icon as a plain SVG element, drawn once by React and copied
    out, since the image is built from plain DOM. */
function iconElement(icon: LucideIcon): Element {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(createElement(icon, { size: 10, strokeWidth: 2.5, "aria-hidden": true })));
  const svg = host.firstElementChild!.cloneNode(true) as Element;
  root.unmount();
  return svg;
}

/**
 * Draws the whole map as a PNG or SVG data URL (Treekit's image export),
 * exactly as it shows on screen: every box where it is (dragged by hand or
 * placed by Tidy up), folded boxes and hidden cut branches left out, cut
 * boxes greyed out while "Hide cut" is off. It never re-tidies: positions
 * come from the store alone (`domain/imageLayout.ts`).
 *
 * The page can't be snapshotted directly: folded boxes are not on it, and
 * it carries buttons, the selection and the dot grid. So this builds a
 * clean copy off-screen out of plain DOM that reuses the page's own CSS
 * classes, so it looks the same: put the boxes and labels on the page,
 * measure them, place them, then draw the arrows with the same geometry
 * the canvas uses (`domain/geometry.ts`, `domain/labels.ts`). No buttons,
 * no notes icons, no highlight.
 */
/** A bracket's round headings and Champion box, as the page draws them
    (BracketDecor), placed round its matches in the image. */
function bracketExtras(map: LinkMap, boxes: Parameters<typeof bracketDecor>[1], shiftX: number, shiftY: number): HTMLElement[] {
  const { headings, champion: spot } = bracketDecor(map, boxes, BRACKET_DECOR.gap);
  const out: HTMLElement[] = [];
  for (const h of headings) {
    const el = document.createElement("div");
    el.className = decorStyles.heading;
    el.textContent = h.text;
    el.style.left = `${h.x + shiftX}px`;
    el.style.top = `${h.bottom + shiftY}px`;
    out.push(el);
  }
  if (spot) {
    const name = playerName(map, champion(map));
    const el = document.createElement("div");
    el.className = decorStyles.champion;
    if (name) el.dataset.won = "";
    el.style.left = `${spot.left + shiftX}px`;
    el.style.top = `${spot.y + shiftY}px`;
    const title = document.createElement("span");
    title.className = decorStyles.title;
    title.textContent = "Champion";
    const who = document.createElement("span");
    who.className = decorStyles.name;
    who.textContent = name || "—";
    if (!name) who.dataset.empty = "";
    el.append(title, who);
    out.push(el);
  }
  return out;
}

interface Scene {
  readonly scene: HTMLElement;
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string;
}

/** Builds the clean picture off-screen, hands it to `draw`, then clears
    it away again. */
async function withScene<T>(
  source: LinkMap,
  draw: (scene: Scene) => Promise<T>,
  only: readonly NodeId[] | null = null,
): Promise<T> {
  const isTree = source.kind === "tree";
  const shown = shownMap(source);
  // A selection: just its boxes and the arrows between them. Cut and
  // start are still judged on the whole map, so they look as on screen.
  const map = only ? pickedMap(shown, only) : shown;
  const cut = looksCut(source);
  const nodeIds = Object.keys(map.nodes) as NodeId[];
  const linkIds = Object.keys(map.links) as LinkId[];

  const stage = document.createElement("div");
  // Off-screen but still laid out (display:none would measure as zero).
  stage.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;";
  // Box names and labels in the map's label style, measured that way too.
  stage.dataset.labelStyle = map.labelStyle;
  document.body.append(stage);

  try {
    // 1. Boxes and labels, unplaced, measured at their natural size.
    const boxEls = new Map<NodeId, HTMLElement>();
    for (const id of nodeIds) {
      const node = map.nodes[id];
      const el = document.createElement("div");
      el.className = boxStyles.box;
      el.dataset.direction = map.direction;
      if (node.color) {
        el.dataset.colored = "true";
        el.style.setProperty("--box-accent", `var(--palette-${node.color})`);
      }
      if (cut.has(id)) el.dataset.cut = "";
      if (isTree && arrowsInto(shown, id) === 0) el.dataset.start = "";
      el.style.position = "absolute";
      if (node.match) {
        // A bracket's match: its two players (MatchBox's look).
        el.classList.add(matchStyles.match);
        const { slots, winner } = node.match;
        for (const player of slots) {
          const row = document.createElement("div");
          row.className = matchStyles.row;
          if (winner && winner === player) row.dataset.winner = "";
          else if (winner) row.dataset.loser = "";
          const name = document.createElement("span");
          name.className = `${matchStyles.pick} ${matchStyles.name}`;
          name.textContent = playerName(map, player) || "—";
          if (!playerName(map, player)) name.dataset.empty = "";
          row.append(name);
          el.append(row);
        }
        stage.append(el);
        boxEls.set(id, el);
        continue;
      }
      const name = document.createElement("span");
      name.className = `${inlineStyles.display} ${boxStyles.name}`;
      name.textContent = node.name || "Untitled";
      el.append(name);
      if (node.status) {
        const badge = document.createElement("span");
        badge.className = boxStyles.badge;
        badge.dataset.status = node.status;
        badge.append(iconElement(STATUS_META[node.status].icon));
        el.append(badge);
      }
      stage.append(el);
      boxEls.set(id, el);
    }
    const labelEls = new Map<LinkId, HTMLElement>();
    for (const id of linkIds) {
      const link = map.links[id];
      if (!link.label) continue;
      const el = document.createElement("div");
      el.className = edgeStyles.label;
      if (cut.has(link.to)) el.dataset.cut = "";
      el.textContent = link.label;
      stage.append(el);
      labelEls.set(id, el);
    }
    const sizes = new Map<NodeId, Size>();
    for (const [id, el] of boxEls) sizes.set(id, { width: el.offsetWidth, height: el.offsetHeight });
    const labelSizes = new Map<LinkId, Size>();
    for (const [id, el] of labelEls) labelSizes.set(id, { width: el.offsetWidth, height: el.offsetHeight });

    // 2. Where everything goes: each box at its saved place, exactly as
    //    on screen (never re-tidied), arrows and labels as the canvas
    //    works them out.
    const { routes: geometries, spots, shift, width: drawnWidth, height, boxes } = imageLayout(map, sizes, labelSizes, ROUTES, LABELS, MARGIN);
    // A bracket's Champion box stands right of the final: room for it.
    // Not for a selection of matches: its headings and Champion would be
    // worked out from a part of the bracket.
    const isBracket = map.kind === "bracket" && !only;
    const width = drawnWidth + (isBracket ? BRACKET_DECOR.gap + BRACKET_DECOR.championWidth : 0);
    const shiftX = shift.x;
    const shiftY = shift.y;

    const scene = document.createElement("div");
    scene.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;`;
    scene.style.background = "var(--page-paper)";
    scene.style.fontFamily = getComputedStyle(document.body).fontFamily;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.style.cssText = "position:absolute;left:0;top:0;overflow:visible;";
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("transform", `translate(${shiftX} ${shiftY})`);
    svg.append(group);
    scene.append(svg);
    for (const [id, g] of geometries) {
      const isCut = cut.has(map.links[id].to);
      const line = document.createElementNS(SVG_NS, "path");
      line.setAttribute("class", edgeStyles.line);
      line.setAttribute("d", roundedPath(g.points, g.corner));
      line.setAttribute("fill", "none");
      if (isCut) line.setAttribute("data-cut", "");
      group.append(line);
      if (g.head) {
        const head = document.createElementNS(SVG_NS, "path");
        head.setAttribute("class", edgeStyles.head);
        head.setAttribute("d", headPath(g.head));
        if (isCut) head.setAttribute("data-cut", "");
        group.append(head);
      }
    }

    for (const [id, el] of boxEls) {
      const { center, size } = boxes.get(id)!;
      el.style.left = `${center.x - size.width / 2 + shiftX}px`;
      el.style.top = `${center.y - size.height / 2 + shiftY}px`;
      scene.append(el);
    }
    for (const [id, el] of labelEls) {
      const at = spots.get(id);
      if (!at) {
        el.remove();
        continue;
      }
      el.style.left = "0";
      el.style.top = "0";
      el.style.transform = `translate(-50%, -50%) translate(${at.x + shiftX}px, ${at.y + shiftY}px)`;
      scene.append(el);
    }
    if (isBracket) scene.append(...bracketExtras(map, boxes, shiftX, shiftY));
    stage.append(scene);
    // The arrows' colours come from CSS variables, which don't survive
    // into the image's SVG: each line and head gets its drawn values
    // written onto it.
    for (const el of group.children) {
      const drawn = getComputedStyle(el);
      for (const prop of ["stroke", "stroke-width", "stroke-dasharray", "fill", "opacity"]) {
        (el as SVGElement).style.setProperty(prop, drawn.getPropertyValue(prop));
      }
    }

    return await draw({ scene, width, height, backgroundColor: getComputedStyle(scene).backgroundColor });
  } finally {
    stage.remove();
  }
}

export function renderMapImage(source: LinkMap, format: ImageFormat): Promise<string> {
  return withScene(source, ({ scene, ...size }) => {
    // Twice the pixels, so text stays sharp when zoomed or printed.
    const options = { ...size, pixelRatio: 2 };
    return format === "png" ? toPng(scene, options) : toSvg(scene, options);
  });
}

/** Browsers cap a canvas side (Chrome: 16384px); past it the image comes
    out blank. Boardkit's limit. */
const MAX_CANVAS_SIDE = 16000;

/** Pixels per CSS pixel for a copied image: 4, as in Boardkit, so a
    picture pasted into Excalidraw (or similar) and resized there stays
    sharp; less for a map so big that 4 would pass the canvas limit. */
export function copyPixelRatio(width: number, height: number): number {
  return Math.min(4, MAX_CANVAS_SIDE / Math.max(width, height, 1));
}

/** The whole map as a high-resolution PNG, for the clipboard; with
    `only`, just those boxes and the arrows between them (a selection). */
export function renderMapPngForCopy(source: LinkMap, only: readonly NodeId[] | null = null): Promise<Blob> {
  return withScene(
    source,
    async ({ scene, ...size }) => {
      const blob = await toBlob(scene, { ...size, pixelRatio: copyPixelRatio(size.width, size.height) });
      if (!blob) throw new Error("toBlob returned null");
      return blob;
    },
    only,
  );
}

/** Puts a PNG (a promise of one, still being drawn) on the clipboard. The
    promise goes in as it is, so Safari counts the write as part of the
    click. Says so in the status line when the browser refuses. */
export async function copyPngToClipboard(png: Promise<Blob>): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch (error) {
    console.error("Copy image failed", error);
    useSyncNotice.getState().say("Couldn't copy the image; use Export > Export PNG image instead.");
    return false;
  }
}
