// Shared by the layout and the simulation, so the door the layout turned to face a
// path is the same one the simulation queues people at.

import { TILE_VOXELS, type ModelDoor } from '../../../../voxel-gen/voxelgen.ts';
import { rotateDoors, type Rotation } from './rotation';

interface Footprint {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

// Indexed by facing: +z, +x, -z, -x.
const STEP = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

// width and depth are the size before the turn; a placement's own are already
// turned and would put doors in the wrong corner on odd turns.
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

// The door's column is clamped onto the footprint first, so a door past the edge
// or across a deep forecourt lands on the same tile.
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

const outside = (step: number, start: number, length: number): number =>
  step > 0 ? start + length : start - 1;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));
