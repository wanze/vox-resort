// Every piece here climbs north unturned and stands on the lower tile of a step, so it ends flush
// with a path one level up.
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

const PAVER = { width: 8, depth: 4 } as const;

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

// Two tiles to a level, so a 1:4 climb, in courses of one paver's depth.
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

// The grout runs along each course's top edge, as it runs along each band of path.ts.
export function ramp(b: VoxelBuilder, half: RampHalf): void {
  const bank: Color = PALETTE.stone.shade;
  for (let z = 0; z <= N; z++) {
    const row = rampRow(half, z);
    const course = courseOf(row);
    const top = rampTreadAt(half, z);
    const ridge = courseOf(row + 1) !== course;
    const offset = (course % 2) * (PAVER.width / 2);
    if (top > 0) b.box(0, N, 0, top - 1, z, z, bank);
    for (let x = 0; x <= N; x++) {
      const isGrout = ridge || (x + offset) % PAVER.width === 0;
      const stone = Math.floor((x + offset) / PAVER.width) + course;
      b.set(x, top, z, isGrout ? PAVING.grout : PAVING.pavers[stone % PAVING.pavers.length]!);
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

// Both flanks are in one model because a mirror is not a quarter turn: only then can one geometry
// cover all four climbs.
export function balustrade(
  b: VoxelBuilder,
  treadAt: (z: number) => number,
  colors: BalustradeColors,
): void {
  const inward = (v: number): number => Math.min(N - BURIED_IN, Math.max(BURIED_IN, v));
  for (let z = 0; z <= N; z++) {
    const tread = treadAt(z);
    for (const x0 of [0, TILE_VOXELS - FLANK]) {
      const x1 = x0 + FLANK - 1;
      b.box(x0, x1, tread + 1, tread + RAIL_HEIGHT - 1, z, z, colors.wall);
      b.box(x0, x1, tread + RAIL_HEIGHT, tread + RAIL_HEIGHT, z, z, colors.cap);
      b.box(inward(x0), inward(x1), 0, tread, inward(z), inward(z), colors.wall);
    }
  }
}
