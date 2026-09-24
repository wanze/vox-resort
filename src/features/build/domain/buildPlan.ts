import type { ObjectTypeDefinition } from '../../catalog/domain/objectTypes';
import {
  derivedKey,
  place,
  type LayoutItem,
  type Placement,
  type Tile,
} from '../../layout/domain/resortLayout';
import { straddledTile, type LevelProvider } from '../../layout/domain/elevation';
import type { Rotation } from '../../layout/domain/rotation';
import { footprintTiles, type TileOccupancy } from './tileOccupancy';

const FLAT: LevelProvider = () => 0;

export interface GroundRule {
  (tile: Tile): boolean;
}

const ANY_GROUND: GroundRule = () => true;

export function buildKey(item: LayoutItem, tile: Tile): string {
  return derivedKey(item.id, tile.x, tile.z);
}

export function isPaintable(item: LayoutItem): boolean {
  return item.tilesX === 1 && item.tilesZ === 1;
}

export interface PlacementPlan {
  readonly placement: Placement;
  readonly blocked: boolean;
}

// Built even when blocked: the preview draws the rejected footprint in red.
export function planAt(
  item: LayoutItem,
  tile: Tile,
  occupancy: TileOccupancy,
  rotation: Rotation = 0,
  levelOf: LevelProvider = FLAT,
  standsOn: GroundRule = ANY_GROUND,
): PlacementPlan {
  const placement = place(
    item,
    buildKey(item, tile),
    tile.x,
    tile.z,
    rotation,
    levelOf(tile.x, tile.z),
  );
  const blocked =
    !occupancy.isFree(placement) ||
    straddledTile(levelOf, placement) !== null ||
    !footprintTiles(placement).every(standsOn);
  return { placement, blocked };
}

// Bresenham rather than the reported samples: a pointer move skips tiles when the camera
// is high or the mouse is quick.
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

export function planStroke(
  item: LayoutItem,
  tiles: readonly Tile[],
  occupancy: TileOccupancy,
  rotation: Rotation = 0,
  levelOf: LevelProvider = FLAT,
  standsOn: GroundRule = ANY_GROUND,
): Placement[] {
  return tiles
    .map((tile) => planAt(item, tile, occupancy, rotation, levelOf, standsOn))
    .filter((plan) => !plan.blocked)
    .map((plan) => plan.placement);
}

export function layoutItemFor(type: ObjectTypeDefinition): LayoutItem {
  return {
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    width: type.model.width,
    depth: type.model.depth,
    category: type.category,
    ...(type.model.placement.ground ? { ground: type.model.placement.ground } : {}),
    ...(type.venue?.doors ? { doors: type.venue.doors } : {}),
  };
}
