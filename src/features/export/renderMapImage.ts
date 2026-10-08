import { toPng, toSvg } from "html-to-image";
import type { LucideIcon } from "lucide-react";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import inlineStyles from "../../components/InlineEditable.module.css";
import { headPath, roundedPath } from "../../domain/arrows";
import { imageLayout } from "../../domain/imageLayout";
import { arrowsInto } from "../../domain/rules";
import { shownMap } from "../../domain/shown";
import { looksCut } from "../../domain/status";
import type { LinkId, LinkMap, NodeId, Size } from "../../domain/types";
import boxStyles from "../map/BoxView.module.css";
import edgeStyles from "../map/LinkEdgeView.module.css";
import { LABELS, ROUTES } from "../map/layoutConfig";
import { STATUS_META } from "../map/statusMeta";

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
export async function renderMapImage(source: LinkMap, format: ImageFormat): Promise<string> {
  const isTree = source.kind === "tree";
  const map = shownMap(source);
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
      if (isTree && arrowsInto(map, id) === 0) el.dataset.start = "";
      el.style.position = "absolute";
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
    const { routes: geometries, spots, shift, width, height, boxes } = imageLayout(map, sizes, labelSizes, ROUTES, LABELS, MARGIN);
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

    const options = {
      width,
      height,
      backgroundColor: getComputedStyle(scene).backgroundColor,
      // Twice the pixels, so text stays sharp when zoomed or printed.
      pixelRatio: 2,
    };
    return format === "png" ? await toPng(scene, options) : await toSvg(scene, options);
  } finally {
    stage.remove();
  }
}
