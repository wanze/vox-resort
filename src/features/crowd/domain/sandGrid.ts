import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { waterStartZ, type Shore } from '../../layout/domain/shoreline';

const SAND_CELL = 2;

// A position is the middle of a body, so boxes grow by this or a grazing line puts a shoulder through.
const BODY_RADIUS = 1.5;

export interface ObstacleBox {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

export interface SandGrid {
  readonly originZ: number;
  readonly columns: number;
  readonly rows: number;
  readonly cells: Uint8Array;
}

export interface SandGridInput {
  readonly shore: Shore;
  readonly tilesX: number;
  readonly obstacles: readonly ObstacleBox[];
}

export function sandGridFor(input: SandGridInput): SandGrid {
  const { shore, tilesX, obstacles } = input;
  let back = Infinity;
  let front = -Infinity;
  for (let tileX = 0; tileX < tilesX; tileX++) {
    const water = waterStartZ(shore, tileX);
    back = Math.min(back, water - shore.spec.beach);
    front = Math.max(front, water);
  }
  const originZ = back * TILE_VOXELS;
  const columns = Math.max(0, Math.ceil((tilesX * TILE_VOXELS) / SAND_CELL));
  const rows = Math.max(0, Math.ceil(((front - back) * TILE_VOXELS) / SAND_CELL));
  const cells = new Uint8Array(columns * rows);

  for (const box of obstacles) {
    const west = Math.max(0, Math.floor((box.x - BODY_RADIUS) / SAND_CELL));
    const east = Math.min(columns - 1, Math.floor((box.x + box.width + BODY_RADIUS) / SAND_CELL));
    const north = Math.max(0, Math.floor((box.z - BODY_RADIUS - originZ) / SAND_CELL));
    const south = Math.min(
      rows - 1,
      Math.floor((box.z + box.depth + BODY_RADIUS - originZ) / SAND_CELL),
    );
    for (let row = north; row <= south; row++) {
      cells.fill(1, row * columns + west, row * columns + east + 1);
    }
  }
  return { originZ, columns, rows, cells };
}

// Past either end of the plot is blocked, or a roamer stepping aside at the end of the
// beach would step off the plot.
export function blockedAt(grid: SandGrid, x: number, z: number): boolean {
  const column = Math.floor(x / SAND_CELL);
  const row = Math.floor((z - grid.originZ) / SAND_CELL);
  if (column < 0 || column >= grid.columns) return true;
  if (row < 0 || row >= grid.rows) return false;
  return grid.cells[row * grid.columns + column] !== 0;
}

// Sampled once per cell, so no grown box slips between samples. The skipped ends let
// somebody get out of a lounger they lie in and walk up to one they claimed.
export function clearLine(
  grid: SandGrid,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  skipStart = 0,
  skipEnd = 0,
): boolean {
  const length = Math.hypot(bx - ax, bz - az);
  const samples = Math.ceil(length / SAND_CELL);
  for (let sample = 0; sample <= samples; sample++) {
    const along = samples === 0 ? 0 : (length * sample) / samples;
    if (along < skipStart || along > length - skipEnd) continue;
    const f = samples === 0 ? 0 : sample / samples;
    if (blockedAt(grid, ax + (bx - ax) * f, az + (bz - az) * f)) return false;
  }
  return true;
}
