/**
 * What a build gesture means: where the object would stand, whether it may, and
 * which tiles a drag ran over.
 *
 * All of it is arithmetic over tiles, so the pointer handling in
 * `adapters/buildPointer.ts` is left with events and Three.js objects and none
 * of the rules.
 *
 * Two of those rules are worth stating here:
 *
 * - **A drag paints, but only for a one-tile object.** Dragging a hotel across
 *   the plot would stamp a row of hotels nobody asked for, whereas dragging a
 *   path is exactly how a path gets drawn. So a single-tile type paints for as
 *   long as the button is down; anything larger places once, where it is
 *   dropped.
 * - **A stroke skips what it cannot have.** The pointer crosses a building on
 *   its way somewhere, and stopping the stroke dead there — or refusing the
 *   whole drag — would both be worse than paving around it.
 *
 * A turn is carried through rather than owned here: `place` takes it, and what
 * comes back is a placement whose footprint is already turned, so a quarter-
 * turned cottage is blocked by exactly the three-by-two tiles it would claim.
 */

import type { ObjectTypeDefinition } from "../../catalog/domain/objectTypes";
import {
  derivedKey,
  place,
  type LayoutItem,
  type Placement,
  type Tile,
} from "../../layout/domain/resortLayout";
import type { Rotation } from "../../layout/domain/rotation";
import type { TileOccupancy } from "./tileOccupancy";

/** Key a placed object gets: its type and the tile it stands on. */
export function buildKey(item: LayoutItem, tile: Tile): string {
  return derivedKey(item.id, tile.x, tile.z);
}

/** Whether holding the button down should keep painting this type. */
export function isPaintable(item: LayoutItem): boolean {
  return item.tilesX === 1 && item.tilesZ === 1;
}

/** Where an object would stand if it were dropped on a tile, and whether it may. */
export interface PlacementPlan {
  readonly placement: Placement;
  /** True when something already stands on one of the tiles it needs. */
  readonly blocked: boolean;
}

/**
 * Plans one placement on a tile.
 *
 * The placement is built whether or not it is blocked, because the preview draws
 * a rejected placement too — a red footprint where the object would have gone is
 * how the pointer says why nothing happened.
 */
export function planAt(
  item: LayoutItem,
  tile: Tile,
  occupancy: TileOccupancy,
  rotation: Rotation = 0,
): PlacementPlan {
  const placement = place(item, buildKey(item, tile), tile.x, tile.z, rotation);
  return { placement, blocked: !occupancy.isFree(placement) };
}

/**
 * The tiles a straight drag from one tile to another runs over, ends included.
 *
 * Bresenham rather than the tiles the pointer actually reported: a pointer move
 * jumps several tiles at a time when the camera is high or the mouse is quick,
 * and a stroke that recorded only the samples would come out as a dotted line.
 */
export function tilesBetween(from: Tile, to: Tile): Tile[] {
  const stepX = Math.sign(to.x - from.x);
  const stepZ = Math.sign(to.z - from.z);
  const spanX = Math.abs(to.x - from.x);
  const spanZ = Math.abs(to.z - from.z);

  const tiles: Tile[] = [];
  let { x, z } = from;
  let error = spanX - spanZ;
  for (;;) {
    tiles.push({ x, z });
    if (x === to.x && z === to.z) return tiles;
    const doubled = error * 2;
    if (doubled > -spanZ) {
      error -= spanZ;
      x += stepX;
    }
    if (doubled < spanX) {
      error += spanX;
      z += stepZ;
    }
  }
}

/**
 * The placements a stroke over these tiles would stand, skipping tiles that are
 * taken. Only meaningful for a paintable type; a larger footprint would have its
 * copies overlapping each other rather than the plot.
 */
export function planStroke(
  item: LayoutItem,
  tiles: readonly Tile[],
  occupancy: TileOccupancy,
  rotation: Rotation = 0,
): Placement[] {
  return tiles
    .map((tile) => planAt(item, tile, occupancy, rotation))
    .filter((plan) => !plan.blocked)
    .map((plan) => plan.placement);
}

/** The layout item for an object type: the footprint, without the voxels. */
export function layoutItemFor(type: ObjectTypeDefinition): LayoutItem {
  return {
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    width: type.model.width,
    depth: type.model.depth,
  };
}
