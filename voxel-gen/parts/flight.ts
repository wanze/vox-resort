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

// Lighter than the grout, so the flank under the railing is one pale face rather than two tones.
const STONE_FLANK: Color = 0xbfae87;

const PAVING_FLIGHT: FlightColors = {
  body: PAVING.grout,
  flank: STONE_FLANK,
  treads: PAVING.pavers,
};

const N = TILE_VOXELS - 1;

const TREADS = LEVEL_VOXELS;

const GOING = TILE_VOXELS / TREADS;

export interface FlightColors {
  readonly body: Color;
  // The outer face under the treads, the one seen from beside the climb.
  readonly flank: Color;
  readonly treads: readonly Color[];
}

function flanks(b: VoxelBuilder, top: number, z0: number, z1: number, color: Color): void {
  if (top <= 0) return;
  b.box(0, 0, 0, top - 1, z0, z1, color);
  b.box(N, N, 0, top - 1, z0, z1, color);
}

// The lowest tread is one voxel above path.ts's slab; each tread's exposed south face is the riser.
export function flight(b: VoxelBuilder, colors: FlightColors = PAVING_FLIGHT): void {
  for (let step = 0; step < TREADS; step++) {
    const top = flightTreadAt(step * GOING);
    const z0 = step * GOING;
    const z1 = z0 + GOING - 1;
    b.box(0, N, 0, top - 1, z0, z1, colors.body);
    flanks(b, top, z0, z1, colors.flank);
    b.box(0, N, top, top, z0, z1, colors.treads[step % colors.treads.length]!);
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

export const courseOf = (row: number): number => Math.floor((row + RAMP_GOING / 2) / RAMP_GOING);

export function rampTreadAt(half: RampHalf, z: number): number {
  return PAVING_VOXELS - 1 + courseOf(rampRow(half, z));
}

// Slabs run up the slope, their joints staggered and halfway along a course: a line across the
// ramp where a course steps up made every riser read as a stair.
const SLAB = { width: 8, length: 8 } as const;

export interface RampFinish {
  readonly bank: Color;
  readonly flank: Color;
  // The colour of one voxel of the walking surface, counted along the climb across both tiles.
  readonly surface: (x: number, row: number) => Color;
}

const SLABS: RampFinish = {
  bank: PALETTE.stone.shade,
  // Pale for the same reason as STONE_FLANK: the grey bank read as a second material.
  flank: PALETTE.sand.base,
  surface: (x, row) => {
    const lane = Math.floor(x / SLAB.width);
    const along = row + (lane % 2) * (SLAB.length / 2);
    const isGrout = x % SLAB.width === 0 || along % SLAB.length === 0;
    const slab = Math.floor(along / SLAB.length) + lane;
    return isGrout ? PAVING.grout : PAVING.pavers[slab % PAVING.pavers.length]!;
  },
};

export function ramp(b: VoxelBuilder, half: RampHalf, finish: RampFinish = SLABS): void {
  for (let z = 0; z <= N; z++) {
    const row = rampRow(half, z);
    const top = rampTreadAt(half, z);
    if (top > 0) b.box(0, N, 0, top - 1, z, z, finish.bank);
    flanks(b, top, z, z, finish.flank);
    for (let x = 0; x <= N; x++) b.set(x, top, z, finish.surface(x, row));
  }
}

const RAIL_HEIGHT = 4;

// Drawn flush, the buried footing would z-fight the paving's own flank. It cannot be left out:
// voxelgen shifts a model onto its origin, which would drop the parapet.
const BURIED_IN = 1;

export type Flank = 'left' | 'right';

const POST_PITCH = 5;

export interface RailingColors {
  readonly post: Color;
  readonly rail: Color;
}

export const TIMBER: RailingColors = { post: PALETTE.teak.shade, rail: PALETTE.teak.light };

// The edge handrail's white, so a stone climb is railed like the path at its top.
export const WHITE: RailingColors = { post: PALETTE.stucco.shade, rail: PALETTE.stucco.base };

// Posts and rails rather than a wall, open so the flank shows the climb's own face under it. Laid
// along the north edge as every edge rail is, one voxel thick, so a wide climb is railed on its
// outer flanks only. Turned onto the left flank x runs up the climb, onto the right flank down it:
// a mirror is not a quarter turn, so each flank is its own model.
export function postRailing(
  b: VoxelBuilder,
  treadAt: (z: number) => number,
  colors: RailingColors,
  flank: Flank,
): void {
  for (let x = 0; x <= N; x++) {
    const tread = treadAt(flank === 'left' ? N - x : x);
    const footing = Math.min(N - BURIED_IN, Math.max(BURIED_IN, x));
    b.box(x, x, tread + 1, tread + 1, 0, 0, colors.post);
    if (x % POST_PITCH === 0) b.box(x, x, tread + 2, tread + RAIL_HEIGHT - 1, 0, 0, colors.post);
    b.box(x, x, tread + RAIL_HEIGHT, tread + RAIL_HEIGHT, 0, 0, colors.rail);
    // Stops under the tread: nothing stands over it to hide a top face level with the tread's.
    if (tread > 0) b.box(footing, footing, 0, tread - 1, BURIED_IN, BURIED_IN, colors.post);
  }
}
