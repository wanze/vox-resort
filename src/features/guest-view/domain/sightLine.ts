import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { rotatePoint, type Rotation } from '../../layout/domain/rotation';
import type { Vec3 } from './followRig';

// Finer than a tile, so a wall one tile thick is never stepped over.
const SAMPLE_VOXELS = 8;

export interface Skyline {
  readonly tilesX: number;
  readonly tilesZ: number;
  // World height of the highest solid top over each plot tile, row by row; 0 for open ground.
  readonly tops: Float32Array;
}

export interface Standing {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  // Already turned, as a placement holds them.
  readonly width: number;
  readonly depth: number;
  readonly rotation: Rotation;
}

// The middle of the part of a model tile the model fills, which for a model narrower than a tile
// is not the tile's middle.
const cellMiddle = (cell: number, size: number): number =>
  cell * TILE_VOXELS + Math.min(TILE_VOXELS, size - cell * TILE_VOXELS) / 2;

function raise(skyline: Skyline, placed: Standing, tops: readonly number[]): void {
  const turned = placed.rotation % 2 === 1;
  const width = turned ? placed.depth : placed.width;
  const depth = turned ? placed.width : placed.depth;
  const across = Math.ceil(width / TILE_VOXELS);
  for (const [cell, top] of tops.entries()) {
    if (top <= 0) continue;
    const middle = {
      x: cellMiddle(cell % across, width),
      z: cellMiddle(Math.floor(cell / across), depth),
    };
    const at = rotatePoint(middle, width, depth, placed.rotation);
    const tileX = Math.floor((placed.x + at.x) / TILE_VOXELS);
    const tileZ = Math.floor((placed.z + at.z) / TILE_VOXELS);
    if (tileX < 0 || tileZ < 0 || tileX >= skyline.tilesX || tileZ >= skyline.tilesZ) continue;
    const tile = tileZ * skyline.tilesX + tileX;
    skyline.tops[tile] = Math.max(skyline.tops[tile]!, placed.y + top);
  }
}

// `topsOf` answers a model's solid tops by id, undefined for one with none.
export function skylineOf(
  standing: readonly Standing[],
  topsOf: (id: string) => readonly number[] | undefined,
  tilesX: number,
  tilesZ: number,
): Skyline {
  const skyline = { tilesX, tilesZ, tops: new Float32Array(tilesX * tilesZ) };
  for (const placed of standing) {
    const tops = topsOf(placed.id);
    if (tops) raise(skyline, placed, tops);
  }
  return skyline;
}

// Null off the plot, where there is only sea and open ground.
function tileUnder(skyline: Skyline, point: Vec3): { tileX: number; tileZ: number } | null {
  const tileX = Math.floor(point.x / TILE_VOXELS);
  const tileZ = Math.floor(point.z / TILE_VOXELS);
  if (tileX < 0 || tileZ < 0 || tileX >= skyline.tilesX || tileZ >= skyline.tilesZ) return null;
  return { tileX, tileZ };
}

const topOf = (skyline: Skyline, tile: { tileX: number; tileZ: number }): number =>
  skyline.tops[tile.tileZ * skyline.tilesX + tile.tileX]!;

function blocked(
  skyline: Skyline,
  groundAt: (tileX: number, tileZ: number) => number,
  point: Vec3,
): boolean {
  const tile = tileUnder(skyline, point);
  if (!tile) return false;
  return point.y < Math.max(topOf(skyline, tile), groundAt(tile.tileX, tile.tileZ));
}

// The share of the way from `from` to `to` that is clear up to the first blocked sample. The tile
// `from` stands in is skipped: a guest under a parasol or in a doorway is not hidden by it.
export function clearShare(
  skyline: Skyline,
  groundAt: (tileX: number, tileZ: number) => number,
  from: Vec3,
  to: Vec3,
): number {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (!(length > 0)) return 1;
  const startX = Math.floor(from.x / TILE_VOXELS);
  const startZ = Math.floor(from.z / TILE_VOXELS);
  let clear = 0;
  for (let along = SAMPLE_VOXELS; along < length + SAMPLE_VOXELS; along += SAMPLE_VOXELS) {
    const share = Math.min(along / length, 1);
    const point = {
      x: from.x + (to.x - from.x) * share,
      y: from.y + (to.y - from.y) * share,
      z: from.z + (to.z - from.z) * share,
    };
    const home =
      Math.floor(point.x / TILE_VOXELS) === startX && Math.floor(point.z / TILE_VOXELS) === startZ;
    if (!home && blocked(skyline, groundAt, point)) return clear;
    clear = share;
  }
  return 1;
}

// A roof, a floor or a terrace above the point: somebody standing there is indoors.
export function roofOver(skyline: Skyline, point: Vec3): boolean {
  const tile = tileUnder(skyline, point);
  return tile !== null && topOf(skyline, tile) > point.y;
}
