import { arrowRoutes, type ArrowRoute, type RouteOptions } from "./arrows";
import type { Box } from "./geometry";
import { placeLabels, type LabelOptions } from "./labels";
import type { LinkId, LinkMap, NodeId, Point, Size } from "./types";

/** Where everything in an exported image goes. Coordinates are the map's
    own; `shift` moves them into the image (its top-left is 0, 0). */
export interface ImageLayout {
  readonly boxes: ReadonlyMap<NodeId, Box>;
  readonly routes: ReadonlyMap<LinkId, ArrowRoute>;
  readonly spots: ReadonlyMap<LinkId, Point>;
  readonly shift: Point;
  readonly width: number;
  readonly height: number;
}

/**
 * Lays out an image of `map` exactly as the canvas shows it: every box at
 * its saved place (where the user put it, or where Tidy up last left it),
 * never re-tidied, with the arrows and labels worked out the way the canvas
 * works them out. Pass the map as it shows (`shownMap`), with each box's
 * and each label's measured size. `margin` is the empty space round it.
 */
export function imageLayout(
  map: LinkMap,
  sizes: ReadonlyMap<NodeId, Size>,
  labelSizes: ReadonlyMap<LinkId, Size>,
  routeOptions: RouteOptions,
  labelOptions: LabelOptions,
  margin: number,
): ImageLayout {
  const boxes = new Map<NodeId, Box>(
    Object.values(map.nodes).map((n) => [n.id, { center: { x: n.x, y: n.y }, size: sizes.get(n.id)! }]),
  );
  const routes = arrowRoutes(Object.values(map.links), boxes, map.arrowStyle, map.direction, routeOptions, labelSizes);
  const spots = placeLabels(
    [...labelSizes.keys()]
      .filter((id) => routes.has(id))
      .map((id) => {
        const g = routes.get(id)!;
        return { id, start: g.labelFrom, tip: g.labelTo, size: labelSizes.get(id)!, path: g.corner ? g.points : undefined };
      }),
    [...boxes.values()],
    labelOptions,
  );

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (c: Point, s: Size) => {
    minX = Math.min(minX, c.x - s.width / 2);
    minY = Math.min(minY, c.y - s.height / 2);
    maxX = Math.max(maxX, c.x + s.width / 2);
    maxY = Math.max(maxY, c.y + s.height / 2);
  };
  for (const box of boxes.values()) grow(box.center, box.size);
  for (const [id, at] of spots) grow(at, labelSizes.get(id)!);
  if (boxes.size === 0) minX = minY = maxX = maxY = 0;

  return {
    boxes,
    routes,
    spots,
    shift: { x: margin - minX, y: margin - minY },
    width: Math.ceil(maxX - minX + margin * 2),
    height: Math.ceil(maxY - minY + margin * 2),
  };
}
