// Courses alternate two tones for free: each course is its own plane, unlike a
// pattern dithered across one face, which defeats the coplanar merge.

import { PALETTE, type Ramp } from '../palette.ts';
import type { VoxelBuilder } from '../voxelgen.ts';

export interface RoofOptions {
  // Corner of the building, not of the eaves.
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly y: number;
  readonly overhang?: number;
  readonly tile?: Ramp;
}

export interface GableRoofOptions extends RoofOptions {
  readonly ridge: 'x' | 'z';
}

const courseColor = (tile: Ramp, course: number): number => (course === 0 ? tile.deep : tile.base);

// A four-wide flat top does not read as a ridge, so the cap is inset where there is room.
const capInset = (lo: number, hi: number): number => (hi - lo >= 3 ? 1 : 0);

export function gableRoof(b: VoxelBuilder, o: GableRoofOptions): number {
  const overhang = o.overhang ?? 2;
  const tile = o.tile ?? PALETTE.terracotta;
  const alongRidge = o.ridge === 'x';
  const alongLo = (alongRidge ? o.x : o.z) - overhang;
  const alongHi = (alongRidge ? o.x + o.w : o.z + o.d) - 1 + overhang;
  let lo = (alongRidge ? o.z : o.x) - overhang;
  let hi = (alongRidge ? o.z + o.d : o.x + o.w) - 1 + overhang;
  if (alongHi < alongLo || hi < lo) throw new Error('A roof needs a footprint to cover');

  let y = o.y;
  let course = 0;
  let capLo = lo;
  let capHi = hi;
  while (lo <= hi) {
    const color = courseColor(tile, course);
    if (alongRidge) b.box(alongLo, alongHi, y, y, lo, hi, color);
    else b.box(lo, hi, y, y, alongLo, alongHi, color);
    capLo = lo;
    capHi = hi;
    lo += 2;
    hi -= 2;
    y++;
    course++;
  }
  const inset = capInset(capLo, capHi);
  if (alongRidge) b.box(alongLo, alongHi, y, y, capLo + inset, capHi - inset, tile.light);
  else b.box(capLo + inset, capHi - inset, y, y, alongLo, alongHi, tile.light);
  return y + 1;
}

export type HipRoofOptions = RoofOptions;

interface HipCap {
  readonly xLo: number;
  readonly xHi: number;
  readonly zLo: number;
  readonly zHi: number;
  readonly y: number;
}

// `step` is the pitch: 2 is the 26-degree tile pitch, 1 the 45-degree thatch.
function hipCourses(
  b: VoxelBuilder,
  o: RoofOptions,
  overhang: number,
  step: number,
  color: (course: number) => number,
): HipCap {
  let xLo = o.x - overhang;
  let xHi = o.x + o.w - 1 + overhang;
  let zLo = o.z - overhang;
  let zHi = o.z + o.d - 1 + overhang;
  if (xHi < xLo || zHi < zLo) throw new Error('A roof needs a footprint to cover');

  let cap: HipCap = { xLo, xHi, zLo, zHi, y: o.y };
  let y = o.y;
  let course = 0;
  while (xLo <= xHi && zLo <= zHi) {
    b.box(xLo, xHi, y, y, zLo, zHi, color(course));
    y++;
    cap = { xLo, xHi, zLo, zHi, y };
    xLo += step;
    xHi -= step;
    zLo += step;
    zHi -= step;
    course++;
  }
  return cap;
}

export function hipRoof(b: VoxelBuilder, o: HipRoofOptions): number {
  const tile = o.tile ?? PALETTE.terracotta;
  const cap = hipCourses(b, o, o.overhang ?? 2, 2, (course) => courseColor(tile, course));
  const insetX = capInset(cap.xLo, cap.xHi);
  const insetZ = capInset(cap.zLo, cap.zHi);
  b.box(
    cap.xLo + insetX,
    cap.xHi - insetX,
    cap.y,
    cap.y,
    cap.zLo + insetZ,
    cap.zHi - insetZ,
    tile.light,
  );
  return cap.y + 1;
}

export interface FlatRoofOptions extends Omit<RoofOptions, 'tile'> {
  readonly parapet?: number;
  readonly cover?: Ramp;
}

export function flatRoof(b: VoxelBuilder, o: FlatRoofOptions): number {
  const overhang = o.overhang ?? 1;
  const parapet = o.parapet ?? 1;
  const cover = o.cover ?? PALETTE.slate;
  const xLo = o.x - overhang;
  const xHi = o.x + o.w - 1 + overhang;
  const zLo = o.z - overhang;
  const zHi = o.z + o.d - 1 + overhang;
  if (xHi < xLo || zHi < zLo) throw new Error('A roof needs a footprint to cover');

  b.box(xLo, xHi, o.y, o.y, zLo, zHi, cover.base);
  for (let layer = o.y + 1; layer <= o.y + parapet; layer++) {
    for (let x = xLo; x <= xHi; x++) {
      b.set(x, layer, zLo, cover.shade);
      b.set(x, layer, zHi, cover.shade);
    }
    for (let z = zLo; z <= zHi; z++) {
      b.set(xLo, layer, z, cover.shade);
      b.set(xHi, layer, z, cover.shade);
    }
  }
  return o.y + parapet + 1;
}

export interface ThatchRoofOptions extends RoofOptions {
  readonly ridge?: 'x' | 'z';
  readonly pole?: Ramp;
  readonly eaves?: number;
}

export function thatchRoof(b: VoxelBuilder, o: ThatchRoofOptions): number {
  const thatch = o.tile ?? PALETTE.thatch;
  const pole = o.pole ?? PALETTE.teak;
  const eaves = o.eaves ?? 2;
  const cap = hipCourses(b, o, o.overhang ?? 3, 1, (course) =>
    course < eaves ? thatch.shade : thatch.base,
  );
  b.box(cap.xLo, cap.xHi, cap.y, cap.y, cap.zLo, cap.zHi, thatch.light);

  // Overruns the ridge a voxel at each end so the roof finishes in a line, not a blunt corner.
  const alongX = (o.ridge ?? (cap.xHi - cap.xLo >= cap.zHi - cap.zLo ? 'x' : 'z')) === 'x';
  const ridge = cap.y + 1;
  if (alongX) b.box(cap.xLo - 1, cap.xHi + 1, ridge, ridge, cap.zLo, cap.zHi, pole.base);
  else b.box(cap.xLo, cap.xHi, ridge, ridge, cap.zLo - 1, cap.zHi + 1, pole.base);
  return ridge + 1;
}
