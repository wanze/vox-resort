import { PALETTE, type Ramp } from '../palette.ts';
import {
  BRIDGE_VOXELS,
  PAVING_VOXELS,
  TILE_VOXELS,
  type ModelLight,
  type VoxelBuilder,
} from '../voxelgen.ts';

const BOARD_WIDTH = 4;

// Two, so a post has a stringer to stand on; every edge rail on the plot is two deep.
export const FLANK = 2;

const RAIL_HEIGHT = 4;

// Five puts a post at each end of a tile and two between them.
const POST_PITCH = 5;

// Never shares a face plane with a railing's trestle, and symmetric under a quarter turn.
const PILE_INSET = 3;
const PILE = 2;

export const LANTERN = PALETTE.amber.light;

export const PARAPET_RAIL = RAIL_HEIGHT;

export interface SpanDeckOptions {
  readonly y: number;
  readonly z0: number;
  readonly z1: number;
  readonly timber?: Ramp;
}

// The deck and its parapet are separate models so a crossing can have a junction:
// `railings.ts` rails only the edges with nothing paved beyond them.
export function spanDeck(b: VoxelBuilder, o: SpanDeckOptions): void {
  if (o.z1 < o.z0) throw new Error('A span deck covers at least one row');
  if (o.y < 1) throw new Error('A span deck has a beam under its planking');

  const timber = o.timber ?? PALETTE.teak;
  const N = TILE_VOXELS - 1;

  b.box(0, N, o.y - 1, o.y - 1, o.z0, o.z1, timber.deep);

  // Four boards to a tile, so the next tile carries the run on rather than restarting it.
  const boards = [timber.base, timber.shade] as const;
  for (let x = 0; x <= N; x++) {
    const board = x % BOARD_WIDTH === 0 ? timber.deep : boards[Math.floor(x / BOARD_WIDTH) % 2]!;
    b.box(x, x, o.y, o.y, o.z0, o.z1, board);
  }
}

export interface SpanPilesOptions {
  readonly beam: number;
  readonly rows: readonly number[];
  readonly timber?: Ramp;
}

export function spanPiles(b: VoxelBuilder, o: SpanPilesOptions): void {
  const timber = o.timber ?? PALETTE.teak;
  const far = TILE_VOXELS - PILE_INSET - PILE;
  for (const z of o.rows) {
    for (const x of [PILE_INSET, far]) {
      b.box(x, x + PILE - 1, 0, o.beam - 1, z, z + PILE - 1, timber.deep);
    }
  }
}

export const PILE_ROWS: readonly number[] = [PILE_INSET, TILE_VOXELS - PILE_INSET - PILE];

export interface SpanParapetOptions {
  readonly planksAt: (x: number) => number;
  readonly timber?: Ramp;
}

// The trestle belongs to the parapet: `voxelgen` shifts every model onto its own origin,
// so a railing painting nothing at the water would drop a metre.
export function spanParapet(b: VoxelBuilder, o: SpanParapetOptions): void {
  const timber = o.timber ?? PALETTE.teak;
  for (let x = 0; x < TILE_VOXELS; x++) {
    const planks = o.planksAt(x);
    const rail = planks + PARAPET_RAIL;
    b.box(x, x, 0, planks - 2, 0, FLANK - 1, timber.deep);
    b.box(x, x, planks + 1, planks + 1, 0, 0, timber.shade);
    if (x % POST_PITCH === 0) b.box(x, x, planks + 2, rail - 1, 0, 0, timber.shade);
    b.box(x, x, rail, rail, 0, 0, timber.light);
  }
}

export interface LanternSpot {
  readonly x: number;
  readonly rail: number;
}

export function spanLantern(b: VoxelBuilder, at: LanternSpot): void {
  const { metal } = PALETTE;
  const x1 = at.x + 1;
  b.box(at.x, x1, at.rail + 1, at.rail + 1, 0, FLANK - 1, metal.deep);
  b.box(at.x, x1, at.rail + 2, at.rail + 3, 0, FLANK - 1, LANTERN);
  b.box(at.x, x1, at.rail + 4, at.rail + 4, 0, FLANK - 1, metal.deep);
}

export function lanternLight(at: LanternSpot): ModelLight {
  return {
    x: at.x + 1,
    y: at.rail + 3,
    z: FLANK / 2,
    color: LANTERN,
    // Dimmer than a street lamp: every rail has one, and each only lights the planking nearby.
    intensity: 30,
    distance: 26,
  };
}

// Here rather than in `bridge-ramp.ts` because the ramp's railings step with these treads.
export const RAMP_TREADS = BRIDGE_VOXELS - PAVING_VOXELS;

export const RAMP_GOING = TILE_VOXELS / RAMP_TREADS;

export function rampPlanksAt(along: number): number {
  return PAVING_VOXELS + Math.floor(along / RAMP_GOING);
}
