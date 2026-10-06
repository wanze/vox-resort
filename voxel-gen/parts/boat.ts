// Everything is drawn bow towards +z, and the waterline is the model origin, so nothing below the
// water is painted and a boat can move on a flat sheet.

import { PALETTE, type Ramp } from '../palette.ts';
import type { ModelSeat, VoxelBuilder } from '../voxelgen.ts';

// Exported because seats are declared as data and cannot read the layer back off hull().
export const HULL_RIM = 4;

const STATIONS = [0.7, 0.9, 1, 1, 0.95, 0.8, 0.55, 0.25] as const;

export interface HullOptions {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly length: number;
  readonly beam: number;
  readonly timber?: Ramp;
  // Painted along the topsides, a course under the gunwale.
  readonly stripe?: Ramp;
}

function beamAt(o: HullOptions, z: number): number {
  const along = z / Math.max(1, o.length - 1);
  const station = STATIONS[Math.min(STATIONS.length - 1, Math.floor(along * STATIONS.length))]!;
  return Math.max(0, Math.round(o.beam * station));
}

// Four courses: at three the floor sits directly under the gunwale and the camera sees a lid.
export function hull(b: VoxelBuilder, o: HullOptions): number {
  if (o.length < 4) throw new Error('A hull is at least four voxels long');
  if (o.beam < 1) throw new Error('A hull has at least one voxel of beam');

  const timber = o.timber ?? PALETTE.teak;
  const floor = o.y + 1;
  const rim = o.y + HULL_RIM - 1;

  for (let along = 0; along < o.length; along++) {
    const half = beamAt(o, along);
    const z = o.z + along;
    const west = o.x - half;
    const east = o.x + half;

    b.box(west, east, o.y, o.y, z, z, timber.deep);
    b.box(west, east, floor, floor, z, z, timber.shade);

    const ends = along === 0 || along === o.length - 1;
    b.box(ends ? west : east, east, floor, rim, z, z, timber.base);
    b.box(west, ends ? east : west, floor, rim, z, z, timber.base);
    b.box(ends ? west : east, east, rim, rim, z, z, timber.light);
    b.box(west, ends ? east : west, rim, rim, z, z, timber.light);
  }
  if (o.stripe) stripe(b, o, o.stripe);
  return o.y + HULL_RIM;
}

// Down the sides only: the transom and the stem keep the hull's own colour.
function stripe(b: VoxelBuilder, o: HullOptions, paint: Ramp): void {
  for (let along = 1; along < o.length - 1; along++) {
    const half = beamAt(o, along);
    b.set(o.x - half, o.y + 2, o.z + along, paint.base);
    b.set(o.x + half, o.y + 2, o.z + along, paint.base);
  }
}

export const PEDALO_LENGTH = 12;
export const PEDALO_BEAM = 4;

// Wider on the water than in the hut's rack: two three-voxel figures abreast need a seven-voxel
// footwell, and three racked boats have to fit two tiles.
export const PEDALO_PAIR_BEAM = 5;

const PEDALO_GUNWALE = 2;

// Abreast on the two pads, which clears both floats only at PEDALO_PAIR_BEAM.
export function pedaloSeats(o: { x: number; y: number; z: number }): ModelSeat[] {
  return [-1, 1].map((side) => ({
    x: o.x + side * 2,
    y: o.y + PEDALO_GUNWALE + 1,
    z: o.z + 4,
    facing: 0,
  }));
}

export interface PedaloOptions {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly beam?: number;
  readonly shell?: Ramp;
  readonly trim?: Ramp;
}

export function pedalo(b: VoxelBuilder, o: PedaloOptions): void {
  const shell = o.shell ?? PALETTE.stucco;
  const trim = o.trim ?? PALETTE.water;
  const { slate } = PALETTE;
  const beam = o.beam ?? PEDALO_BEAM;

  const stern = o.z;
  const bow = o.z + PEDALO_LENGTH - 1;
  const well = o.y + 1;
  const gunwale = o.y + PEDALO_GUNWALE;

  for (const side of [-1, 1] as const) {
    const outer = o.x + side * beam;
    const inner = o.x + side * (beam - 1);
    const west = Math.min(outer, inner);
    const east = Math.max(outer, inner);
    b.box(west, east, o.y, o.y, stern, bow - 1, shell.shade);
    b.box(west, east, well, gunwale, stern, bow - 1, shell.base);
    b.box(west, east, gunwale, gunwale, stern, bow - 1, shell.light);
    b.box(outer, outer, well, well, stern + 1, bow - 2, trim.base);
    b.box(inner, inner, o.y, well, bow, bow, shell.light);
  }

  b.box(o.x - beam + 2, o.x + beam - 2, o.y, o.y, stern + 2, bow - 1, shell.shade);
  b.box(o.x - beam + 2, o.x + beam - 2, well, well, stern + 2, bow - 1, shell.light);
  for (const side of [-1, 1] as const) {
    const seat = o.x + side * 2;
    const west = Math.min(seat, seat - side);
    b.box(west, west + 1, gunwale, gunwale, stern + 4, stern + 6, trim.base);
    b.box(west, west + 1, gunwale + 1, gunwale + 2, stern + 3, stern + 3, trim.shade);
  }

  b.box(o.x - 1, o.x + 1, well, gunwale + 1, stern, stern + 1, slate.shade);
  b.box(o.x - 2, o.x + 2, gunwale, gunwale, stern, stern + 1, slate.light);
}

// Half the beam, stern to bow: broad aft where the riders' feet go, sharp at the nose.
const JET_SKI_HALF = [1, 2, 2, 2, 2, 2, 2, 1, 1, 0] as const;

const SADDLE = 2;
const HOOD_FROM = 6;

// Astride the saddle, one behind the other: the driver first, so a lone rider is driving.
export function jetSkiSeats(o: { x: number; y: number; z: number }): ModelSeat[] {
  return [5, 2].map((along) => ({
    x: o.x,
    y: o.y + SADDLE + 1,
    z: o.z + along,
    facing: 0,
    pose: 'sit',
  }));
}

export interface CraftOptions {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly trim?: Ramp;
}

export function jetSki(b: VoxelBuilder, o: CraftOptions): void {
  const { slate, stucco } = PALETTE;
  const cowl = o.trim ?? PALETTE.bloom;
  for (const [along, half] of JET_SKI_HALF.entries()) {
    const z = o.z + along;
    const west = o.x - half;
    const east = o.x + half;
    b.box(west, east, o.y, o.y, z, z, stucco.shade);
    b.box(west, east, o.y + 1, o.y + 1, z, z, stucco.base);
    if (half > 1) {
      b.set(west, o.y + 1, z, cowl.base);
      b.set(east, o.y + 1, z, cowl.base);
    }
    // Open either side of the saddle, so the riders' feet have somewhere to go.
    if (along < HOOD_FROM) {
      b.set(west, o.y + SADDLE, z, stucco.light);
      b.set(east, o.y + SADDLE, z, stucco.light);
      if (along > 0) b.set(o.x, o.y + SADDLE, z, slate.shade);
    } else {
      b.box(west, east, o.y + SADDLE, o.y + SADDLE, z, z, cowl.base);
    }
  }
  const hood = o.z + HOOD_FROM + 1;
  b.box(o.x - 1, o.x + 1, o.y + SADDLE + 1, o.y + SADDLE + 1, hood, hood + 1, cowl.light);
  b.box(o.x - 2, o.x + 2, o.y + SADDLE + 2, o.y + SADDLE + 2, hood, hood, slate.shade);
}

const TUBE_LENGTH = 17;

// A rider every four voxels, front first: three apart and their knees would be in the back ahead.
export function bananaSeats(o: { x: number; y: number; z: number }): ModelSeat[] {
  return [14, 10, 6, 2].map((along) => ({
    x: o.x,
    y: o.y + 2,
    z: o.z + along,
    facing: 0,
    pose: 'sit',
  }));
}

export function banana(b: VoxelBuilder, o: CraftOptions): void {
  const { amber } = PALETTE;
  const handles = o.trim ?? PALETTE.bloom;
  const bow = o.z + TUBE_LENGTH;
  b.box(o.x - 1, o.x + 1, o.y, o.y, o.z, bow - 1, amber.shade);
  b.box(o.x - 1, o.x + 1, o.y + 1, o.y + 1, o.z, bow - 1, amber.base);
  b.box(o.x, o.x, o.y + 1, o.y + 1, o.z + 1, bow - 1, amber.light);
  for (const side of [-2, 2])
    b.box(o.x + side, o.x + side, o.y, o.y, o.z + 3, o.z + 13, amber.deep);

  b.box(o.x - 1, o.x + 1, o.y, o.y + 1, bow, bow, amber.base);
  b.set(o.x, o.y + 2, bow, amber.base);
  b.box(o.x, o.x, o.y + 1, o.y + 3, bow + 1, bow + 1, amber.base);
  b.box(o.x, o.x, o.y + 3, o.y + 4, bow + 2, bow + 2, amber.light);

  // Beside the saddle line rather than across it, so no rider sits on a grip.
  for (const seat of bananaSeats(o)) {
    for (const side of [-1, 1]) b.set(o.x + side, o.y + 2, seat.z + 2, handles.base);
  }
}
