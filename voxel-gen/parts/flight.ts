// Every piece of paving here climbs north unturned and stands on the lower tile of a step, so it
// ends flush with a path one level up.
import { PALETTE } from '../palette.ts';
import {
  LEVEL_VOXELS,
  PAVING_VOXELS,
  TILE_VOXELS,
  type Color,
  type VoxelBuilder,
} from '../voxelgen.ts';

// path.ts's own colours, so a flight or a ramp reads as the path it continues.
const PAVING = {
  grout: 0x9a8a6a,
  pavers: [0xc3b189, 0xb6a379, 0xcdbc95],
} as const;

const N = TILE_VOXELS - 1;

const TREADS = LEVEL_VOXELS;

const GOING = TILE_VOXELS / TREADS;

// The lowest tread is one voxel above path.ts's slab; each tread's exposed south face is the riser.
export function flight(b: VoxelBuilder): void {
  for (let step = 0; step < TREADS; step++) {
    const top = flightTreadAt(step * GOING);
    const z0 = step * GOING;
    const z1 = z0 + GOING - 1;
    b.box(0, N, 0, top - 1, z0, z1, PAVING.grout);
    b.box(0, N, top, top, z0, z1, PAVING.pavers[step % PAVING.pavers.length]!);
  }
}

export function flightTreadAt(z: number): number {
  return PAVING_VOXELS + LEVEL_VOXELS - 1 - Math.floor(z / GOING);
}

export type RampHalf = 'foot' | 'head';

// Two tiles to a level, so a 1:4 climb: a voxel's rise every course, the finest a voxel slope gets.
const RAMP_GOING = (2 * TILE_VOXELS) / LEVEL_VOXELS;

// Counted up the climb across both tiles. The first and last course are half deep, so both ends
// are flush with the path they meet rather than a voxel proud of it.
function rampRow(half: RampHalf, z: number): number {
  return (half === 'head' ? TILE_VOXELS : 0) + N - z;
}

const courseOf = (row: number): number => Math.floor((row + RAMP_GOING / 2) / RAMP_GOING);

export function rampTreadAt(half: RampHalf, z: number): number {
  return PAVING_VOXELS - 1 + courseOf(rampRow(half, z));
}

// Slabs run up the slope, their joints staggered and halfway along a course: a line across the
// ramp where a course steps up made every riser read as a stair.
const SLAB = { width: 8, length: 8 } as const;

export function ramp(b: VoxelBuilder, half: RampHalf): void {
  const bank: Color = PALETTE.stone.shade;
  for (let z = 0; z <= N; z++) {
    const row = rampRow(half, z);
    const top = rampTreadAt(half, z);
    if (top > 0) b.box(0, N, 0, top - 1, z, z, bank);
    for (let x = 0; x <= N; x++) {
      const lane = Math.floor(x / SLAB.width);
      const along = row + (lane % 2) * (SLAB.length / 2);
      const isGrout = x % SLAB.width === 0 || along % SLAB.length === 0;
      const slab = Math.floor(along / SLAB.length) + lane;
      b.set(x, top, z, isGrout ? PAVING.grout : PAVING.pavers[slab % PAVING.pavers.length]!);
    }
  }
}

const RAIL_HEIGHT = 4;

const FLANK = 2;

// Drawn flush, the buried footing would z-fight the paving's own flank. It cannot be left out:
// voxelgen shifts a model onto its origin, which would drop the parapet.
const BURIED_IN = 1;

export interface BalustradeColors {
  readonly wall: Color;
  readonly cap: Color;
}

export type Flank = 'left' | 'right';

// One flank, laid along the north edge as every edge rail is, so a wide climb is railed on its
// outer flanks only. Turned onto the left flank x runs up the climb, onto the right flank down it:
// a mirror is not a quarter turn, so each flank is its own model.
export function balustrade(
  b: VoxelBuilder,
  treadAt: (z: number) => number,
  colors: BalustradeColors,
  flank: Flank,
): void {
  for (let x = 0; x <= N; x++) {
    const tread = treadAt(flank === 'left' ? N - x : x);
    const footing = Math.min(N - BURIED_IN, Math.max(BURIED_IN, x));
    b.box(x, x, tread + 1, tread + RAIL_HEIGHT - 1, 0, FLANK - 1, colors.wall);
    b.box(x, x, tread + RAIL_HEIGHT, tread + RAIL_HEIGHT, 0, FLANK - 1, colors.cap);
    b.box(footing, footing, 0, tread, BURIED_IN, FLANK - 1, colors.wall);
  }
}
