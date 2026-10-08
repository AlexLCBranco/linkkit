import { ReactFlow, ReactFlowProvider, useReactFlow, type NodeChange, type NodeOrigin } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { arrowRoutes } from "../../domain/arrows";
import type { Box } from "../../domain/geometry";
import { placeLabels } from "../../domain/labels";
import { layoutMap } from "../../domain/layout";
import { shownMap } from "../../domain/shown";
import { boxesIn, marqueeSelection, rectBetween, type Rect } from "../../domain/marquee";
import { boxBounds, clampToPage, keepOnPage, pageSize, placeBlockBeside, placeOnPage } from "../../domain/page";
import { scrollAfterZoom, ZOOM_MAX, ZOOM_MIN, zoomPage, type ZoomedPage } from "../../domain/zoom";
import type { ArrowLength, LayoutDirection, LinkId, LinkMap, NodeId, Point, Size } from "../../domain/types";
import { selectionOf, useMapStore } from "../../store/mapStore";
import { useViewStore, zoomOf } from "../../store/viewStore";
import { BoxContextMenu } from "./BoxContextMenu";
import { BoxView, type BoxFlowNode } from "./BoxView";
import { ConnectPreview } from "./ConnectPreview";
import { DropPreview } from "./DropPreview";
import { HintBubble } from "./HintBubble";
import { RelinkPreview } from "./RelinkPreview";
import { useHint } from "../../store/hint";
import {
  DRAG_THRESHOLD,
  LABEL_FALLBACK_SIZE,
  LABELS,
  layoutOptions,
  MAP_LAYOUT,
  PAGE_INSETS,
  PAGE_MARGIN,
  PASTE_BLOCK,
  ROUTES,
  TIDY_GLIDE_MS,
} from "./layoutConfig";
import { LinkEdgeView, type LinkFlowEdge } from "./LinkEdgeView";
import styles from "./MapCanvas.module.css";
import { MAP_PAGE_ATTRIBUTE, MAP_SHEET_ATTRIBUTE, MAP_VIEW_ATTRIBUTE, screenSize } from "./pageMarkers";
import { useGlide } from "./useGlide";
import { useMapShortcuts } from "./useMapShortcuts";

// Defined once at module level: React Flow warns (and re-mounts every
// node) if these objects change identity between renders.
const nodeTypes = { box: BoxView };
const edgeTypes = { link: LinkEdgeView };
/** A node's position is its centre, matching how the map stores boxes. */
const CENTER_ORIGIN: NodeOrigin = [0.5, 0.5];
const NO_DATA = {};
/** Double-clicking a tree's paper adds nothing: the hint says how instead. */
const PAPER_REFUSAL = "With tree rules on, every box needs a parent: use a box’s + button, or drag its dot onto the paper.";
/** The page before the screen is first measured. */
const FILL = { width: "100%", height: "100%" };

/** The page (in page units) placed and scaled where it is drawn; the whole
    area until measured. */
function sheetStyle(page: Size | null, drawn: ZoomedPage | null) {
  if (!page || !drawn) return FILL;
  return {
    width: page.width,
    height: page.height,
    transform: `translate(${drawn.x}px, ${drawn.y}px) scale(${drawn.zoom})`,
  };
}

/** A label's size: measured, or a typical one's if not yet. An arrow with
    no label (a tree's) takes no room until something on it is measured. */
const NO_LABEL: Size = { width: 0, height: 0 };
function labelSize(map: LinkMap, labelSizes: ReadonlyMap<LinkId, Size>, id: LinkId): Size {
  return labelSizes.get(id) ?? (map.links[id]?.label ? LABEL_FALLBACK_SIZE : NO_LABEL);
}

/** Tidy up's options: the arrow length and direction asked for, with room
    for every arrow's label. */
function tidyOptions(map: LinkMap, labelSizes: ReadonlyMap<LinkId, Size>, arrowLength: ArrowLength, direction: LayoutDirection) {
  const labels = (Object.keys(map.links) as LinkId[]).map((id) => labelSize(map, labelSizes, id));
  return layoutOptions(arrowLength, direction, labels);
}

/**
 * The map on its page: dotted paper filling the screen (the area under the
 * header), as in Treekit. The camera never pans. The page grows past the
 * screen only where the boxes need it (a big tidied map, or a window made
 * smaller), and then the browser scrolls natively.
 *
 * Zoom (the pill, per map) is a magnifying glass: every box keeps its place
 * on the page, and every rule above works in page units at any zoom. Only
 * the drawing scales: React Flow draws at the zoom, and the page's dotted
 * paper and the previews on it (the "sheet") scale with it. What scrolls
 * is the zoomed page (see `zoomPage`).
 *
 * Data flow, one direction only:
 *   store map (+ measured sizes) -> arrow geometry and label spots
 *   -> React Flow nodes/edges -> BoxView / LinkEdgeView.
 * React Flow is a renderer, not the source of truth. The one thing read
 * back from it is each box's measured size, which arrows and Tidy up need
 * (a long name makes a wider or taller box); labels report their own.
 *
 * First visit: the example's boxes all start on one spot. They are drawn
 * hidden, measured, tidied once, and only then shown.
 *
 * Editing: double-click empty paper adds a box there; dragging on empty
 * paper draws a marquee that picks every box it holds (Shift adds to what
 * is picked); Delete removes the selected box(es). Everything else starts on a box or a label (BoxView,
 * LinkEdgeView). A box that grows past the screen's edge (a longer name, a
 * smaller window) is moved back onto it.
 *
 * Tidy up (asked for by the header button, or by switching between
 * Top-down and Left-right) runs here, because only the canvas knows each
 * box's size; the boxes glide to their new places, set on the screen where
 * the Align panel says (centred unless chosen otherwise). Align itself
 * moves the whole map there as it is, and glides the same way.
 */
function MapCanvasInner() {
  // The map as it shows: with "hide cut" on, boxes that look cut are not
  // drawn, measured or laid out (they keep their saved places).
  const map = useMapStore((s) => shownMap(s.map));
  const needsTidy = useMapStore((s) => s.needsTidy);
  const placeAll = useMapStore((s) => s.placeAll);
  const select = useMapStore((s) => s.select);
  const addBox = useMapStore((s) => s.addBox);
  const nudgeBoxes = useMapStore((s) => s.nudgeBoxes);
  const { screenToFlowPosition } = useReactFlow();

  // The screen's size, kept up to date as the window (or a scrollbar)
  // changes it. Null until first measured: nothing is placed before then.
  const viewRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const measure = () =>
      setScreen((old) => {
        const next = screenSize(view);
        // Not laid out (a hidden tab): keep what was known.
        if (next.width === 0 || next.height === 0) return old;
        return old && old.width === next.width && old.height === next.height ? old : next;
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    return () => observer.disconnect();
  }, []);

  // Clicking a box selects it (BoxView); clicking empty paper or pressing
  // Escape clears it (as in the prototype). Selection is the store's, not
  // React Flow's: React Flow's own selecting stays off. The keys (Escape,
  // Delete, undo, colours) are in useMapShortcuts.
  // A marquee that ends over the paper also counts as a click there, which
  // must not clear the boxes it just picked.
  const marqueeEnded = useRef(false);
  const onPaneClick = useCallback(() => {
    if (marqueeEnded.current) marqueeEnded.current = false;
    else select(null);
  }, [select]);
  useMapShortcuts();

  // Measured sizes are view state, not map data: they depend on fonts and
  // CSS, so they live here, never in the saved map.
  const [sizes, setSizes] = useState<ReadonlyMap<NodeId, Size>>(() => new Map());
  const nodeIds = useMemo(() => Object.keys(map.nodes) as NodeId[], [map.nodes]);
  const allMeasured = nodeIds.every((id) => sizes.has(id));

  // Labels are not measured by React Flow: each reports its own size.
  // Tidy up reads them too, to leave every label room on its arrow.
  const [labelSizes, setLabelSizes] = useState<ReadonlyMap<LinkId, Size>>(() => new Map());
  // The ref is updated the moment a label reports, not after the next
  // render: a tree re-tidies right after a label changes (see
  // settleRequest), and must see the new size, or the gap a removed label
  // leaves behind.
  const labelSizesRef = useRef(labelSizes);

  useEffect(() => {
    if (!needsTidy || !allMeasured || !screen) return;
    const align = useViewStore.getState().alignment;
    const options = tidyOptions(map, labelSizesRef.current, map.arrowLength, map.direction);
    const placed = placeOnPage(layoutMap(map, sizes, options), screen, PAGE_MARGIN, align);
    placeAll(placed.positions, placed.page);
  }, [needsTidy, allMeasured, screen, map, sizes, placeAll]);

  // A box that grew past the screen's edge (renamed, or newly named) moves
  // back onto it, unless other boxes already make the page bigger there.
  // Only boxes whose size changed: a smaller window moves nothing (the page
  // scrolls instead). Not while waiting for the first tidy: those boxes are
  // still stacked on one spot, about to be placed anyway.
  const checkedSizes = useRef<ReadonlyMap<NodeId, Size>>(new Map());
  useEffect(() => {
    if (!screen) return;
    const before = checkedSizes.current;
    checkedSizes.current = sizes;
    if (needsTidy) return;
    const changed = [...sizes].filter(([id, s]) => {
      const old = before.get(id);
      return !old || old.width !== s.width || old.height !== s.height;
    });
    if (changed.length === 0) return;
    const { map } = useMapStore.getState();
    const ids = changed.map(([id]) => id);
    const moves = keepOnPage(map, sizes, MAP_LAYOUT.fallbackSize, PAGE_INSETS, screen, ids);
    if (moves.size > 0) nudgeBoxes(moves);
  }, [needsTidy, screen, sizes, nudgeBoxes]);

  // The page: the screen, or bigger where the boxes reach further.
  const page = useMemo(
    () => (screen ? pageSize(map, sizes, MAP_LAYOUT.fallbackSize, PAGE_INSETS, screen) : null),
    [map, sizes, screen],
  );

  // The page as drawn at this map's zoom, and React Flow's camera to match:
  // never panned, only scaled and set where the zoomed page goes.
  const zoom = useViewStore((s) => zoomOf(s.zooms, map.id));
  const alignment = useViewStore((s) => s.alignment);
  const drawn = useMemo(
    () => (page && screen ? zoomPage(page, screen, zoom, alignment) : null),
    [page, screen, zoom, alignment],
  );
  const viewport = useMemo(() => (drawn ? { x: drawn.x, y: drawn.y, zoom: drawn.zoom } : undefined), [drawn]);

  // A zoom keeps the spot in the middle of the screen in the middle. The
  // scroll is the one before the zoom (kept as it scrolls): by now the
  // browser may already have cut it short to fit a smaller page.
  const scrolled = useRef({ left: 0, top: 0 });
  const onScroll = useCallback(() => {
    const view = viewRef.current;
    if (view) scrolled.current = { left: view.scrollLeft, top: view.scrollTop };
  }, []);
  const drawnBefore = useRef<ZoomedPage | null>(null);
  useLayoutEffect(() => {
    const before = drawnBefore.current;
    drawnBefore.current = drawn;
    const view = viewRef.current;
    if (!view || !before || !drawn || before.zoom === drawn.zoom) return;
    const { left, top } = scrolled.current;
    const to = scrollAfterZoom({ left, top, width: view.clientWidth, height: view.clientHeight }, before, drawn);
    view.scrollTo(to);
    scrolled.current = { left: view.scrollLeft, top: view.scrollTop };
  }, [drawn]);

  // Read by handlers outside rendering (Tidy up, double-click), which need
  // the sizes and the page at that moment without re-subscribing on every
  // change.
  const sizesRef = useRef(sizes);
  const screenRef = useRef(screen);
  const pageRef = useRef(page);
  useEffect(() => {
    sizesRef.current = sizes;
    screenRef.current = screen;
    pageRef.current = page;
  }, [sizes, screen, page]);

  // Double-clicking empty paper adds a box there, ready for its name. React
  // Flow has no "pane double-click", so the page listens and checks that
  // the click landed on the bare pane (not a box, arrow or label).
  const onPageDoubleClick = useCallback(
    (e: MouseEvent) => {
      const page = pageRef.current;
      if (!page || !(e.target as Element).classList.contains("react-flow__pane")) return;
      const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // A tree grows only from its boxes ("+", or a box's dot): a box
      // added on its own would be loose. Said where it was tried.
      if (useMapStore.getState().map.kind === "tree") {
        useHint.getState().show(PAPER_REFUSAL, at);
        return;
      }
      // Not measured yet: a typical box's size keeps it on the page for now.
      addBox(clampToPage(at, MAP_LAYOUT.fallbackSize, page, PAGE_INSETS));
    },
    [addBox, screenToFlowPosition],
  );

  // Tidy up and Align: the new places go into the store at once, as one
  // change; `useGlide` then draws the boxes on their way there.
  const glide = useGlide(map.nodes, TIDY_GLIDE_MS);
  const startGlide = glide.start;
  useEffect(() => {
    const centres = (m: typeof map) => new Map<NodeId, Point>(Object.values(m.nodes).map((n) => [n.id, { x: n.x, y: n.y }]));
    const glideFrom = (from: Map<NodeId, Point>) => startGlide(from, shownMap(useMapStore.getState().map).nodes);
    // Tidy up, in the direction and arrow length asked for (switching
    // either is a tidy with the new setting, saved together with it).
    const offTidy = useMapStore.subscribe((s, prev) => {
      if (s.tidyRequest === prev.tidyRequest || s.needsTidy) return;
      const screen = screenRef.current;
      if (!screen) return;
      const { direction, arrowLength, gesture } = s.tidyRequest;
      const shown = shownMap(s.map);
      const layout = layoutMap(shown, sizesRef.current, tidyOptions(shown, labelSizesRef.current, arrowLength, direction), direction);
      const placed = placeOnPage(layout, screen, PAGE_MARGIN, useViewStore.getState().alignment);
      const from = centres(shown);
      s.placeAll(placed.positions, placed.page, { direction, arrowLength }, gesture);
      // Dragged or scrolled: the boxes follow the hand at once.
      if (!gesture) glideFrom(from);
    });
    // Align: the whole map moves as one block, its shape untouched.
    const offAlign = useViewStore.subscribe((v, prev) => {
      const s = useMapStore.getState();
      const screen = screenRef.current;
      if (v.applied === prev.applied || s.needsTidy || !screen) return;
      const shown = shownMap(s.map);
      const from = centres(shown);
      const bounds = boxBounds(shown, sizesRef.current, MAP_LAYOUT.fallbackSize);
      const placed = placeOnPage({ positions: from, bounds }, screen, PAGE_MARGIN, v.alignment);
      s.placeAll(placed.positions);
      glideFrom(from);
    });
    return () => {
      offTidy();
      offAlign();
    };
  }, [startGlide]);

  // A tree that grew (a next step, a second parent, a new step's name)
  // re-tidies itself once every box is measured, and the boxes glide to
  // make room. The tidy joins the change's own undo step (`nudgeBoxes`), so
  // undo takes back the step and the room made for it together.
  const settleTree = useCallback(
    (sizes: ReadonlyMap<NodeId, Size>, screen: Size) => {
      const s = useMapStore.getState();
      const shown = shownMap(s.map);
      const options = tidyOptions(shown, labelSizesRef.current, shown.arrowLength, shown.direction);
      const layout = layoutMap(shown, sizes, options, shown.direction);
      const placed = placeOnPage(layout, screen, PAGE_MARGIN, useViewStore.getState().alignment);
      const from = new Map<NodeId, Point>(Object.values(shown.nodes).map((n) => [n.id, { x: n.x, y: n.y }]));
      s.nudgeBoxes(placed.positions);
      startGlide(from, shownMap(useMapStore.getState().map).nodes);
    },
    [startGlide],
  );
  const settleRequest = useMapStore((s) => s.settleRequest);
  const settled = useRef(settleRequest);
  useEffect(() => {
    if (settleRequest === settled.current || !allMeasured || !screen || needsTidy) return;
    settled.current = settleRequest;
    settleTree(sizes, screen);
  }, [settleRequest, allMeasured, screen, needsTidy, sizes, settleTree]);

  // Switching a tree's label style resizes its boxes (Treekit's are wider):
  // once the new sizes are measured, it re-tidies as a tree that grew does,
  // joined to the switch's undo step. Only a switch on this map: opening
  // another map with another style moves nothing. It waits a moment past
  // the boxes' new sizes, so the arrow labels (measured on their own) have
  // reported theirs too. Any edit to the boxes before then (a box dragged
  // while the sizes were still coming in, or another map opened) calls it
  // off, so a late re-tidy never undoes the user's own move.
  const styled = useRef({ id: map.id, style: map.labelStyle });
  const atSwitch = useRef<{ sizes: ReadonlyMap<NodeId, Size>; nodes: LinkMap["nodes"] } | null>(null);
  useEffect(() => {
    const before = styled.current;
    styled.current = { id: map.id, style: map.labelStyle };
    if (before.style !== map.labelStyle) {
      atSwitch.current = before.id === map.id && map.kind === "tree" ? { sizes, nodes: map.nodes } : null;
      return;
    }
    if (!atSwitch.current) return;
    if (atSwitch.current.nodes !== map.nodes) {
      atSwitch.current = null;
      return;
    }
    if (atSwitch.current.sizes === sizes || !allMeasured || !screen || needsTidy) return;
    const later = setTimeout(() => {
      atSwitch.current = null;
      settleTree(sizesRef.current, screen);
    });
    return () => clearTimeout(later);
  }, [map.id, map.kind, map.labelStyle, map.nodes, sizes, allMeasured, screen, needsTidy, settleTree]);

  // An outline pasted into a map without tree rules: only the new boxes
  // are laid out, as a block beside the box they were pasted into, in free
  // space; nothing else moves. Joined to the paste's undo step
  // (`nudgeBoxes`), and the boxes glide there.
  const placeRequest = useMapStore((s) => s.placeRequest);
  const placed = useRef(placeRequest);
  useEffect(() => {
    if (!placeRequest || placeRequest === placed.current || !allMeasured || !screen || needsTidy) return;
    placed.current = placeRequest;
    const s = useMapStore.getState();
    const anchor = s.map.nodes[placeRequest.anchor];
    const ids = new Set(placeRequest.ids.filter((id) => s.map.nodes[id]));
    if (!anchor || ids.size === 0) return;
    const block: LinkMap = {
      ...s.map,
      nodes: Object.fromEntries([...ids].map((id) => [id, s.map.nodes[id]])),
      links: Object.fromEntries(Object.values(s.map.links).filter((l) => ids.has(l.from) && ids.has(l.to)).map((l) => [l.id, l])),
    };
    const layout = layoutMap(block, sizes, tidyOptions(block, labelSizesRef.current, s.map.arrowLength, s.map.direction));
    const box = (id: NodeId) => ({ center: s.map.nodes[id], size: sizes.get(id) ?? MAP_LAYOUT.fallbackSize });
    const others = (Object.keys(shownMap(s.map).nodes) as NodeId[]).filter((id) => !ids.has(id) && id !== anchor.id).map(box);
    const positions = placeBlockBeside(layout, box(anchor.id), others, PASTE_BLOCK, s.map.direction);
    const from = new Map<NodeId, Point>([...ids].map((id) => [id, { x: s.map.nodes[id].x, y: s.map.nodes[id].y }]));
    s.nudgeBoxes(positions);
    startGlide(from, shownMap(useMapStore.getState().map).nodes);
  }, [placeRequest, allMeasured, screen, needsTidy, sizes, startGlide]);

  const at = useCallback((id: NodeId): Point => glide.shown?.get(id) ?? map.nodes[id], [glide.shown, map.nodes]);

  const nodes = useMemo<BoxFlowNode[]>(
    () =>
      nodeIds.map((id) => {
        const node = at(id);
        return {
          id,
          type: "box",
          position: { x: node.x, y: node.y },
          data: NO_DATA,
          // Handing React Flow back the size it measured (normally done by
          // `applyNodeChanges`): these node objects are rebuilt every render,
          // and without it React Flow forgets the measurement -- and with it
          // the arrows, which need it.
          measured: sizes.get(id),
        };
      }),
    [nodeIds, at, sizes],
  );

  const onLabelSize = useCallback((id: LinkId, size: Size | null) => {
    const prev = labelSizesRef.current;
    const old = prev.get(id);
    if (size ? old && old.width === size.width && old.height === size.height : !old) return;
    const next = new Map(prev);
    if (size) next.set(id, size);
    else next.delete(id);
    labelSizesRef.current = next;
    setLabelSizes(next);
  }, []);

  // Every arrow's line, then every label's spot, worked out together here
  // because labels must keep clear of each other (see domain/labels.ts).
  const boxes = useMemo(() => {
    const out = new Map<NodeId, Box>();
    for (const id of nodeIds) {
      const size = sizes.get(id);
      if (size) out.set(id, { center: at(id), size });
    }
    return out;
  }, [nodeIds, at, sizes]);

  const boxesRef = useRef(boxes);
  useEffect(() => {
    boxesRef.current = boxes;
  }, [boxes]);

  // The marquee: pressing on empty paper and dragging draws a box, and
  // every box it holds is picked as it goes (live, as in Treekit). A press
  // that doesn't travel is a plain click (clears the selection), and a
  // double-click still adds a box. Hand-written like a box's drag, because
  // React Flow's own marquee works on its own selection, not the store's.
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const onPagePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      marqueeEnded.current = false;
      if (e.button !== 0 || !(e.target as Element).classList.contains("react-flow__pane")) return;
      const startClient = { x: e.clientX, y: e.clientY };
      const start = screenToFlowPosition(startClient);
      const before = selectionOf(useMapStore.getState());
      const adding = e.shiftKey;
      let moved = false;
      // On the window, not captured by the page: a capture would retarget
      // the click, and double-clicking the paper would stop adding boxes.
      const move = (ev: PointerEvent) => {
        if (!moved && Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) < DRAG_THRESHOLD) return;
        moved = true;
        const rect = rectBetween(start, screenToFlowPosition({ x: ev.clientX, y: ev.clientY }));
        setMarquee(rect);
        useMapStore.getState().selectGroup(marqueeSelection(before, boxesIn(rect, boxesRef.current), adding));
      };
      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        setMarquee(null);
        marqueeEnded.current = moved;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [screenToFlowPosition],
  );

  // Each arrow's line, head and label stretch, in the map's arrow style
  // (`domain/arrows.ts`). The elbow style makes room below its turns for
  // the labels, so it is given their sizes.
  const geometries = useMemo(() => {
    const labelled = new Map<LinkId, Size>();
    for (const link of Object.values(map.links)) if (link.label) labelled.set(link.id, labelSize(map, labelSizes, link.id));
    return arrowRoutes(Object.values(map.links), boxes, map.arrowStyle, map.direction, ROUTES, labelled);
  }, [map, boxes, labelSizes]);

  const labelSpots = useMemo(
    () =>
      placeLabels(
        [...geometries].map(([id, g]) => ({
          id,
          start: g.labelFrom,
          tip: g.labelTo,
          path: g.corner ? g.points : undefined,
          size: labelSize(map, labelSizes, id),
        })),
        [...boxes.values()],
        LABELS,
      ),
    [geometries, boxes, labelSizes, map],
  );

  const edges = useMemo<LinkFlowEdge[]>(
    () =>
      (Object.keys(map.links) as LinkId[]).map((id) => {
        const link = map.links[id];
        return {
          id,
          source: link.from,
          target: link.to,
          type: "link",
          data: { geometry: geometries.get(id) ?? null, labelAt: labelSpots.get(id) ?? null, onLabelSize },
        };
      }),
    [map.links, geometries, labelSpots, onLabelSize],
  );

  const onNodesChange = useCallback((changes: NodeChange<BoxFlowNode>[]) => {
    // Only measured sizes are read back.
    setSizes((prev) => {
      let next: Map<NodeId, Size> | null = null;
      for (const change of changes) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        const id = change.id as NodeId;
        const { width, height } = change.dimensions;
        const old = prev.get(id);
        if (old && old.width === width && old.height === height) continue;
        next ??= new Map(prev);
        next.set(id, { width, height });
      }
      return next ?? prev;
    });
  }, []);

  return (
    <BoxContextMenu>
      <div
        ref={viewRef}
        className={styles.canvas}
        data-ready={needsTidy ? undefined : true}
        // Box names and arrow labels in the map's label style (CSS only).
        data-label-style={map.labelStyle}
        onScroll={onScroll}
        {...{ [MAP_VIEW_ATTRIBUTE]: true }}
      >
        <div
          className={styles.page}
          style={drawn ? { width: drawn.width, height: drawn.height } : FILL}
          onDoubleClick={onPageDoubleClick}
          onPointerDown={onPagePointerDown}
          data-marquee={marquee ? true : undefined}
          {...{ [MAP_PAGE_ATTRIBUTE]: true }}
        >
          {/* The dotted paper, under React Flow, zoomed with the boxes. */}
          <div
            className={styles.paper}
            style={sheetStyle(page, drawn)}
            aria-hidden
            {...{ [MAP_SHEET_ATTRIBUTE]: true }}
          />
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodeOrigin={CENTER_ORIGIN}
            onNodesChange={onNodesChange}
            onPaneClick={onPaneClick}
            // Moving and connecting are hand-written (useBoxGestures), so
            // they go through the store, never React Flow's own state.
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            // Tab visits boxes (Enter selects one) and arrow labels, not
            // the arrow lines, which have nothing to do with focus.
            edgesFocusable={false}
            // The camera is locked; the wheel scrolls the page natively.
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            viewport={viewport}
            minZoom={ZOOM_MIN}
            maxZoom={ZOOM_MAX}
            panActivationKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            deleteKeyCode={null}
            disableKeyboardA11y
            // Bottom-right belongs to the version badge.
            attributionPosition="top-right"
          />
          {/* Previews over the boxes, in page units like them, zoomed the same way. */}
          <div className={styles.sheet} style={sheetStyle(page, drawn)}>
            <ConnectPreview boxes={boxes} />
            <RelinkPreview boxes={boxes} />
            <DropPreview />
            <HintBubble />
            {marquee && (
              <div
                className={styles.marquee}
                style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
                aria-hidden
              />
            )}
          </div>
        </div>
      </div>
    </BoxContextMenu>
  );
}

export function MapCanvas() {
  return (
    <ReactFlowProvider>
      <MapCanvasInner />
    </ReactFlowProvider>
  );
}
