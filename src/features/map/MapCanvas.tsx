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

import { linkGeometry, type Box, type LinkGeometry } from "../../domain/geometry";
import { placeLabels } from "../../domain/labels";
import { layoutMap } from "../../domain/layout";
import { boxesIn, marqueeSelection, rectBetween, type Rect } from "../../domain/marquee";
import { boxBounds, clampToPage, keepOnPage, pageSize, placeOnPage } from "../../domain/page";
import type { ArrowLength, LayoutDirection, LinkId, LinkMap, NodeId, Point, Size } from "../../domain/types";
import { selectionOf, useMapStore } from "../../store/mapStore";
import { useViewStore } from "../../store/viewStore";
import { BoxContextMenu } from "./BoxContextMenu";
import { BoxView, type BoxFlowNode } from "./BoxView";
import { ConnectPreview } from "./ConnectPreview";
import {
  ARROW,
  DRAG_THRESHOLD,
  LABEL_FALLBACK_SIZE,
  LABELS,
  layoutOptions,
  MAP_LAYOUT,
  PAGE_INSETS,
  PAGE_MARGIN,
  TIDY_GLIDE_MS,
  TWIN_OFFSET,
} from "./layoutConfig";
import { LinkEdgeView, type LinkFlowEdge } from "./LinkEdgeView";
import styles from "./MapCanvas.module.css";
import { MAP_PAGE_ATTRIBUTE, MAP_VIEW_ATTRIBUTE, screenSize } from "./pageMarkers";
import { useGlide } from "./useGlide";
import { useMapShortcuts } from "./useMapShortcuts";

// Defined once at module level: React Flow warns (and re-mounts every
// node) if these objects change identity between renders.
const nodeTypes = { box: BoxView };
const edgeTypes = { link: LinkEdgeView };
/** A node's position is its centre, matching how the map stores boxes. */
const CENTER_ORIGIN: NodeOrigin = [0.5, 0.5];
const NO_DATA = {};
/** The page before the screen is first measured. */
const FILL = { width: "100%", height: "100%" };

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
 * header), as in Treekit. The camera never moves (no pan, no zoom). The
 * page grows past the screen only where the boxes need it (a big tidied
 * map, or a window made smaller), and then the browser scrolls natively.
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
  const map = useMapStore((s) => s.map);
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
      // A tree grows only from its boxes ("+", or a box's dot): a box
      // added on its own would be loose.
      if (useMapStore.getState().map.kind === "tree") return;
      const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
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
    const glideFrom = (from: Map<NodeId, Point>) => startGlide(from, useMapStore.getState().map.nodes);
    // Tidy up, in the direction and arrow length asked for (switching
    // either is a tidy with the new setting, saved together with it).
    const offTidy = useMapStore.subscribe((s, prev) => {
      if (s.tidyRequest === prev.tidyRequest || s.needsTidy) return;
      const screen = screenRef.current;
      if (!screen) return;
      const { direction, arrowLength, gesture } = s.tidyRequest;
      const layout = layoutMap(s.map, sizesRef.current, tidyOptions(s.map, labelSizesRef.current, arrowLength, direction), direction);
      const placed = placeOnPage(layout, screen, PAGE_MARGIN, useViewStore.getState().alignment);
      const from = centres(s.map);
      s.placeAll(placed.positions, placed.page, { direction, arrowLength }, gesture);
      // Dragged or scrolled: the boxes follow the hand at once.
      if (!gesture) glideFrom(from);
    });
    // Align: the whole map moves as one block, its shape untouched.
    const offAlign = useViewStore.subscribe((v, prev) => {
      const s = useMapStore.getState();
      const screen = screenRef.current;
      if (v.applied === prev.applied || s.needsTidy || !screen) return;
      const from = centres(s.map);
      const bounds = boxBounds(s.map, sizesRef.current, MAP_LAYOUT.fallbackSize);
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
  const settleRequest = useMapStore((s) => s.settleRequest);
  const settled = useRef(settleRequest);
  useEffect(() => {
    if (settleRequest === settled.current || !allMeasured || !screen || needsTidy) return;
    settled.current = settleRequest;
    const s = useMapStore.getState();
    const options = tidyOptions(s.map, labelSizesRef.current, s.map.arrowLength, s.map.direction);
    const layout = layoutMap(s.map, sizes, options, s.map.direction);
    const placed = placeOnPage(layout, screen, PAGE_MARGIN, useViewStore.getState().alignment);
    const from = new Map<NodeId, Point>(Object.values(s.map.nodes).map((n) => [n.id, { x: n.x, y: n.y }]));
    s.nudgeBoxes(placed.positions);
    startGlide(from, useMapStore.getState().map.nodes);
  }, [settleRequest, allMeasured, screen, needsTidy, sizes, startGlide]);

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

  const geometries = useMemo(() => {
    const out = new Map<LinkId, LinkGeometry>();
    const links = Object.values(map.links);
    // An arrow whose reverse is also on the map is drawn a little to its
    // own right, so the pair sit side by side instead of on top of each
    // other.
    const pairs = new Set(links.map((l) => `${l.from}>${l.to}`));
    for (const link of links) {
      const from = boxes.get(link.from);
      const to = boxes.get(link.to);
      const offset = pairs.has(`${link.to}>${link.from}`) ? TWIN_OFFSET : 0;
      const g = from && to ? linkGeometry(from, to, ARROW, offset) : null;
      if (g) out.set(link.id, g);
    }
    return out;
  }, [map.links, boxes]);

  const labelSpots = useMemo(
    () =>
      placeLabels(
        [...geometries].map(([id, g]) => ({
          id,
          start: g.start,
          tip: g.head[0],
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
        {...{ [MAP_VIEW_ATTRIBUTE]: true }}
      >
        <div
          className={styles.page}
          style={page ? { width: page.width, height: page.height } : FILL}
          onDoubleClick={onPageDoubleClick}
          onPointerDown={onPagePointerDown}
          data-marquee={marquee ? true : undefined}
          {...{ [MAP_PAGE_ATTRIBUTE]: true }}
        >
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
            minZoom={1}
            maxZoom={1}
            panActivationKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            deleteKeyCode={null}
            disableKeyboardA11y
            // Bottom-right belongs to the version badge.
            attributionPosition="top-right"
          />
          <ConnectPreview boxes={boxes} />
          {marquee && (
            <div
              className={styles.marquee}
              style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
              aria-hidden
            />
          )}
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
