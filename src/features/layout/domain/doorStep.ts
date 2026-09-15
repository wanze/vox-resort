/**
 * Where a building's declared doors are on the plot, and which tile each one
 * opens onto.
 *
 * Two questions with one answer, asked from two sides: the layout wants to know
 * whether a door will open onto paving before it settles which way a building
 * stands, and the simulation wants the walk-graph nodes on that same tile to
 * queue people at. A rule written twice would be a door the layout turned to
 * face a path and the simulation then looked for somewhere else.
 *
 * See `ModelDoor` in `voxel-gen/voxelgen.ts` for what the art declares.
 */

import { TILE_VOXELS, type ModelDoor } from '../../../../voxel-gen/voxelgen.ts';
import { rotateDoors, type Rotation } from './rotation';

/** The tiles something claims on the grid, already turned. */
interface Footprint {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

/** One step on the tile grid per facing, in the `+z, +x, -z, -x` sequence. */
const STEP = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

/**
 * A model's declared doors in world voxels, turned the way the placement is.
 *
 * `width` and `depth` are the model's size **before** the turn, because that is
 * what `rotatePoint` measures a point against - and a placement's own `width`
 * and `depth` are already turned. Hand those in instead and every door on an
 * odd turn of a building that is not square lands in the wrong corner.
 */
export function placedDoors(
  placement: { readonly x: number; readonly z: number; readonly rotation: Rotation },
  declared: readonly ModelDoor[],
  width: number,
  depth: number,
): readonly ModelDoor[] {
  return rotateDoors(declared, width, depth, placement.rotation).map((door) => ({
    x: placement.x + door.x,
    z: placement.z + door.z,
    facing: door.facing,
  }));
}

/**
 * The first tile outside the footprint, straight out from a door in world voxels.
 *
 * The door's own column is clamped onto the footprint first, so a door declared
 * a voxel over the edge - or anywhere across a deep forecourt - comes out on
 * the same tile. What decides the tile is which side the door is on and how far
 * along that side, and nothing else.
 */
export function doorStepTile(
  footprint: Footprint,
  door: ModelDoor,
): { readonly x: number; readonly z: number } {
  const { tileX, tileZ, tilesX, tilesZ } = footprint;
  const alongX = clamp(Math.floor(door.x / TILE_VOXELS), tileX, tileX + tilesX - 1);
  const alongZ = clamp(Math.floor(door.z / TILE_VOXELS), tileZ, tileZ + tilesZ - 1);
  const [dx, dz] = STEP[door.facing];
  return {
    x: dx === 0 ? alongX : outside(dx, tileX, tilesX),
    z: dz === 0 ? alongZ : outside(dz, tileZ, tilesZ),
  };
}

/** The row or column just past the footprint on the side a step points to. */
const outside = (step: number, start: number, length: number): number =>
  step > 0 ? start + length : start - 1;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));
