/**
 * What stands on the sand, as a bitmap a roamer can ask about a straight line.
 *
 * A roamer walks a straight line to a point they picked, and before this module
 * that line went through whatever was in the way: loungers, parasols, the hire
 * hut, a beach club's deck. The fix is deliberately not per frame. A roamer's
 * line is decided once, when they set off, so the question "is it clear?" is
 * asked once per segment — every few seconds per roamer — and the per-frame
 * loop in `crowd.ts` learns nothing about obstacles at all.
 *
 * **A bitmap, not a list of boxes.** A line test against every object on the
 * beach would be a loop over a few hundred boxes per sample; against a bitmap it
 * is one index. The bitmap covers only the band of rows the sand can reach, so
 * on the reference plot it is about fifty kilobytes, built once per resort.
 *
 * **Boxes are the model's own footprint**, as the layout already turned it, and
 * grown by the half-width of a person: a person's position is the middle of
 * their body, so a line that merely grazed a box would put a shoulder through
 * it. Paving is not an obstacle — a boardwalk is two voxels high and people
 * step over it — which is why the network hands this objects and not paths.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { waterStartZ, type Shore } from '../../layout/domain/shoreline';

/** Voxels per cell side: half a metre, finer than any gap worth walking through. */
const SAND_CELL = 2;

/** Half the width of a person, in voxels; what every box is grown by. */
const BODY_RADIUS = 1.5;

/** Something standing on the plot, as the ground plane sees it. */
export interface ObstacleBox {
  /** World-space corner of the model, in voxels. */
  readonly x: number;
  readonly z: number;
  /** The model's size as it stands, in voxels. */
  readonly width: number;
  readonly depth: number;
}

export interface SandGrid {
  /** Voxel z of the first row of cells. */
  readonly originZ: number;
  readonly columns: number;
  readonly rows: number;
  /** One byte per cell, row-major; non-zero is blocked. */
  readonly cells: Uint8Array;
}

export interface SandGridInput {
  readonly shore: Shore;
  /** Columns the plot has, which is how far east the beach runs. */
  readonly tilesX: number;
  readonly obstacles: readonly ObstacleBox[];
}

/**
 * The beach's bitmap, with every obstacle that reaches the band painted in.
 *
 * The band runs from the back of the sand in the column where it lies furthest
 * inland to the water in the column where the water lies furthest out, so every
 * point `beachPointAt` can draw is inside it.
 */
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

/**
 * Whether a point on the sand is inside something.
 *
 * Anything in front of or behind the band answers no: where the sand ends is
 * `beachPointAt`'s business, and a gate on the paving behind the beach is
 * somewhere a roamer is allowed to walk to. Past either end of the plot answers
 * yes, though: the beach stops there, and a roamer stepping aside for somebody
 * at the very end of it would otherwise step off the plot.
 */
export function blockedAt(grid: SandGrid, x: number, z: number): boolean {
  const column = Math.floor(x / SAND_CELL);
  const row = Math.floor((z - grid.originZ) / SAND_CELL);
  if (column < 0 || column >= grid.columns) return true;
  if (row < 0 || row >= grid.rows) return false;
  return grid.cells[row * grid.columns + column] !== 0;
}

/**
 * Whether a straight walk from `a` to `b` touches nothing.
 *
 * Sampled every cell's length along the chord, which is fine enough that no
 * grown box can slip between two samples. The first `skipStart` and last
 * `skipEnd` voxels are not asked about, which is what lets somebody get up out
 * of a lounger they are lying *in*, and walk up to one they have claimed.
 */
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
