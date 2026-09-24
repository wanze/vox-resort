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
  return o.y + HULL_RIM;
}

export const PEDALO_LENGTH = 12;
export const PEDALO_BEAM = 4;

const PEDALO_GUNWALE = 2;

// One seat: the footwell is five voxels and a figure three, so two abreast would each put a leg in a float.
export function pedaloSeats(o: { x: number; y: number; z: number }): ModelSeat[] {
  return [{ x: o.x - 1, y: o.y + PEDALO_GUNWALE + 1, z: o.z + 4, facing: 0 }];
}

export interface PedaloOptions {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly shell?: Ramp;
  readonly trim?: Ramp;
}

export function pedalo(b: VoxelBuilder, o: PedaloOptions): void {
  const shell = o.shell ?? PALETTE.stucco;
  const trim = o.trim ?? PALETTE.water;
  const { slate } = PALETTE;

  const stern = o.z;
  const bow = o.z + PEDALO_LENGTH - 1;
  const well = o.y + 1;
  const gunwale = o.y + PEDALO_GUNWALE;

  for (const side of [-1, 1] as const) {
    const outer = o.x + side * PEDALO_BEAM;
    const inner = o.x + side * (PEDALO_BEAM - 1);
    const west = Math.min(outer, inner);
    const east = Math.max(outer, inner);
    b.box(west, east, o.y, o.y, stern, bow - 1, shell.shade);
    b.box(west, east, well, gunwale, stern, bow - 1, shell.base);
    b.box(west, east, gunwale, gunwale, stern, bow - 1, shell.light);
    b.box(outer, outer, well, well, stern + 1, bow - 2, trim.base);
    b.box(inner, inner, o.y, well, bow, bow, shell.light);
  }

  b.box(o.x - PEDALO_BEAM + 2, o.x + PEDALO_BEAM - 2, o.y, o.y, stern + 2, bow - 1, shell.shade);
  b.box(o.x - PEDALO_BEAM + 2, o.x + PEDALO_BEAM - 2, well, well, stern + 2, bow - 1, shell.light);
  for (const side of [-1, 1] as const) {
    const seat = o.x + side * 2;
    const west = Math.min(seat, seat - side);
    b.box(west, west + 1, gunwale, gunwale, stern + 4, stern + 6, trim.base);
    b.box(west, west + 1, gunwale + 1, gunwale + 2, stern + 3, stern + 3, trim.shade);
  }

  b.box(o.x - 1, o.x + 1, well, gunwale + 1, stern, stern + 1, slate.shade);
  b.box(o.x - 2, o.x + 2, gunwale, gunwale, stern, stern + 1, slate.light);
}
