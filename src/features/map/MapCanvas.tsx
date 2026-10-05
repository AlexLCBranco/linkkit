import { ReactFlow, ReactFlowProvider, useReactFlow, type NodeChange, type NodeOrigin } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { linkGeometry, type Box, type LinkGeometry } from "../../domain/geometry";
import { placeLabels } from "../../domain/labels";
import { layoutMap } from "../../domain/layout";
import { clampToPage, keepOnPage, minPageSize, placeOnPage } from "../../domain/page";
import type { LinkId, NodeId, Point, Size } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { BoxView, type BoxFlowNode } from "./BoxView";
import { ConnectPreview } from "./ConnectPreview";
import {
  ARROW,
  LABEL_FALLBACK_SIZE,
  LABELS,
  MAP_LAYOUT,
  PAGE_FLOOR,
  PAGE_INSETS,
  PAGE_MARGIN,
  TIDY_GLIDE_MS,
  TWIN_OFFSET,
} from "./layoutConfig";
import { LinkEdgeView, type LinkFlowEdge } from "./LinkEdgeView";
import styles from "./MapCanvas.module.css";
import { PageHandles } from "./PageHandles";
import { MAP_PAGE_ATTRIBUTE, MAP_VIEW_ATTRIBUTE } from "./pageMarkers";
import { useGlide } from "./useGlide";

// Defined once at module level: React Flow warns (and re-mounts every
// node) if these objects change identity between renders.
const nodeTypes = { box: BoxView };
const edgeTypes = { link: LinkEdgeView };
/** A node's position is its centre, matching how the map stores boxes. */
const CENTER_ORIGIN: NodeOrigin = [0.5, 0.5];
const NO_DATA = {};

/**
 * The map on its page: a fixed-size sheet of dotted paper. The camera never
 * moves (no pan, no zoom); when the page is bigger than the screen, the
 * browser scrolls it natively.
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
 * Editing: double-click empty paper adds a box there; Delete removes the
 * selected box. Everything else starts on a box or a label (BoxView,
 * LinkEdgeView). A box that grows past the page's edge (a longer name) is
 * moved back onto it.
 *
 * Tidy up (asked for by the header button) runs here, because only the
 * canvas knows each box's size; the boxes glide to their new places. The
 * page's resize handles (PageHandles) draw a size while being dragged and
 * save it when let go.
 */
function MapCanvasInner() {
  const map = useMapStore((s) => s.map);
  const needsTidy = useMapStore((s) => s.needsTidy);
  const placeAll = useMapStore((s) => s.placeAll);
  const select = useMapStore((s) => s.select);
  const addBox = useMapStore((s) => s.addBox);
  const moveBoxes = useMapStore((s) => s.moveBoxes);
  const { screenToFlowPosition } = useReactFlow();

  // Clicking a box selects it (BoxView); clicking empty paper or pressing
  // Escape clears it (as in the prototype). Selection is the store's, not
  // React Flow's: React Flow's own selecting stays off. Delete (or
  // Backspace) removes the selected box. Typing in a name or label never
  // gets here: the text field keeps its keys to itself.
  const onPaneClick = useCallback(() => select(null), [select]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { selected, editing, deleteBox } = useMapStore.getState();
      if (e.key === "Escape") select(null);
      else if ((e.key === "Delete" || e.key === "Backspace") && selected && !editing) {
        e.preventDefault();
        deleteBox(selected);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [select]);

  // Double-clicking empty paper adds a box there, ready for its name. React
  // Flow has no "pane double-click", so the page listens and checks that
  // the click landed on the bare pane (not a box, arrow or label).
  const onPageDoubleClick = useCallback(
    (e: MouseEvent) => {
      if (!(e.target as Element).classList.contains("react-flow__pane")) return;
      const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Not measured yet: a typical box's size keeps it on the page for now.
      addBox(clampToPage(at, MAP_LAYOUT.fallbackSize, useMapStore.getState().map.page, PAGE_INSETS));
    },
    [addBox, screenToFlowPosition],
  );

  // Measured sizes are view state, not map data: they depend on fonts and
  // CSS, so they live here, never in the saved map.
  const [sizes, setSizes] = useState<ReadonlyMap<NodeId, Size>>(() => new Map());
  const nodeIds = useMemo(() => Object.keys(map.nodes) as NodeId[], [map.nodes]);
  const allMeasured = nodeIds.every((id) => sizes.has(id));

  useEffect(() => {
    if (!needsTidy || !allMeasured) return;
    const placed = placeOnPage(layoutMap(map, sizes, MAP_LAYOUT), map.page, PAGE_MARGIN);
    placeAll(placed.positions, placed.page);
  }, [needsTidy, allMeasured, map, sizes, placeAll]);

  // A box that grew past the page's edge (renamed, or newly named) moves
  // back onto it. Not while waiting for the first tidy: those boxes are
  // still stacked on one spot, about to be placed anyway.
  useEffect(() => {
    if (needsTidy) return;
    const moves = keepOnPage(map, sizes, PAGE_INSETS);
    if (moves.size > 0) moveBoxes(moves);
  }, [needsTidy, map, sizes, moveBoxes]);

  // Read by handlers outside rendering (Tidy up, the resize handles), which
  // need the sizes at that moment without re-subscribing on every change.
  const sizesRef = useRef(sizes);
  useEffect(() => {
    sizesRef.current = sizes;
  }, [sizes]);

  // Tidy up (the header button): the new places go into the store at once,
  // as one change; `useGlide` then draws the boxes on their way there.
  const glide = useGlide(map.nodes, TIDY_GLIDE_MS);
  const startGlide = glide.start;
  useEffect(
    () =>
      useMapStore.subscribe((s, prev) => {
        if (s.tidyRequest === prev.tidyRequest || s.needsTidy) return;
        const before = s.map;
        const placed = placeOnPage(layoutMap(before, sizesRef.current, MAP_LAYOUT), before.page, PAGE_MARGIN);
        const from = new Map<NodeId, Point>(Object.values(before.nodes).map((n) => [n.id, { x: n.x, y: n.y }]));
        s.placeAll(placed.positions, placed.page);
        startGlide(from, useMapStore.getState().map.nodes);
      }),
    [startGlide],
  );
  const at = useCallback((id: NodeId): Point => glide.shown?.get(id) ?? map.nodes[id], [glide.shown, map.nodes]);

  // The page's size while the corner grip or "More room" tab is dragged:
  // drawn, but only saved when let go.
  const [draftPage, setDraftPage] = useState<Size | null>(null);
  const page = draftPage ?? map.page;
  const minSize = useCallback(
    () => minPageSize(useMapStore.getState().map, sizesRef.current, MAP_LAYOUT.fallbackSize, PAGE_INSETS, PAGE_FLOOR),
    [],
  );

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

  // Labels are not measured by React Flow: each reports its own size.
  const [labelSizes, setLabelSizes] = useState<ReadonlyMap<LinkId, Size>>(() => new Map());
  const onLabelSize = useCallback((id: LinkId, size: Size | null) => {
    setLabelSizes((prev) => {
      const old = prev.get(id);
      if (size ? old && old.width === size.width && old.height === size.height : !old) return prev;
      const next = new Map(prev);
      if (size) next.set(id, size);
      else next.delete(id);
      return next;
    });
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
          size: labelSizes.get(id) ?? LABEL_FALLBACK_SIZE,
        })),
        [...boxes.values()],
        LABELS,
      ),
    [geometries, boxes, labelSizes],
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
    <div className={styles.canvas} data-ready={needsTidy ? undefined : true} {...{ [MAP_VIEW_ATTRIBUTE]: true }}>
      <div className={styles.sheet}>
        <div
          className={styles.page}
          style={{ width: page.width, height: page.height }}
          onDoubleClick={onPageDoubleClick}
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
          <PageHandles minSize={minSize} onDraft={setDraftPage} />
        </div>
      </div>
    </div>
  );
}

export function MapCanvas() {
  return (
    <ReactFlowProvider>
      <MapCanvasInner />
    </ReactFlowProvider>
  );
}
