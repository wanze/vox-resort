/**
 * Roofs.
 *
 * Two shapes cover the whole lane: a gable for anything long, a hip for
 * anything square or L-shaped. Both are laid in courses that step in two voxels
 * for every one they rise, which is the 26-degree pitch the reference renders
 * are drawn at, and both overhang the wall they sit on — the overhang is what
 * makes a building read as built rather than as extruded, because it is what
 * casts a line of shadow down the wall.
 *
 * Courses alternate between two tones of the same tile. Each course is its own
 * horizontal plane, so alternating there costs no triangles — unlike a pattern
 * dithered across one face, which defeats the coplanar merge entirely.
 */

import { PALETTE, type Ramp } from '../palette.ts';
import type { VoxelBuilder } from '../voxelgen.ts';

export interface RoofOptions {
  /** Corner of the *building*: the roof works its own overhang out. */
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  /** Lowest roof layer, normally what `stuccoWall` handed back. */
  readonly y: number;
  /** How far the eaves stand out from the wall. Two voxels is 50 cm. */
  readonly overhang?: number;
  readonly tile?: Ramp;
}

export interface GableRoofOptions extends RoofOptions {
  /** The axis the ridge runs along; the slopes fall across the other one. */
  readonly ridge: 'x' | 'z';
}

const courseColor = (tile: Ramp, course: number): number => (course === 0 ? tile.deep : tile.base);

/**
 * The ridge sits on the last course, inset a voxel either side where there is
 * room for it. Stepping in two voxels a side means a course is four wide before
 * it closes, and a four-wide flat top does not read as a ridge.
 */
const capInset = (lo: number, hi: number): number => (hi - lo >= 3 ? 1 : 0);

/**
 * A pitched roof with a ridge along one axis and a gable at either end.
 *
 * Returns the first free layer above the ridge, for a chimney or a finial.
 */
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

/**
 * A roof that falls away on all four sides, capped by a ridge where the plan is
 * longer than it is wide and by a point where it is square.
 *
 * Returns the first free layer above the cap.
 */
export function hipRoof(b: VoxelBuilder, o: HipRoofOptions): number {
  const overhang = o.overhang ?? 2;
  const tile = o.tile ?? PALETTE.terracotta;
  let xLo = o.x - overhang;
  let xHi = o.x + o.w - 1 + overhang;
  let zLo = o.z - overhang;
  let zHi = o.z + o.d - 1 + overhang;
  if (xHi < xLo || zHi < zLo) throw new Error('A roof needs a footprint to cover');

  let y = o.y;
  let course = 0;
  let capXLo = xLo;
  let capXHi = xHi;
  let capZLo = zLo;
  let capZHi = zHi;
  while (xLo <= xHi && zLo <= zHi) {
    b.box(xLo, xHi, y, y, zLo, zHi, courseColor(tile, course));
    capXLo = xLo;
    capXHi = xHi;
    capZLo = zLo;
    capZHi = zHi;
    xLo += 2;
    xHi -= 2;
    zLo += 2;
    zHi -= 2;
    y++;
    course++;
  }
  const insetX = capInset(capXLo, capXHi);
  const insetZ = capInset(capZLo, capZHi);
  b.box(capXLo + insetX, capXHi - insetX, y, y, capZLo + insetZ, capZHi - insetZ, tile.light);
  return y + 1;
}

export interface FlatRoofOptions extends Omit<RoofOptions, 'tile'> {
  /** Layers of parapet standing above the slab. */
  readonly parapet?: number;
  readonly cover?: Ramp;
}

/**
 * The flat roof of a utility building: a slab standing slightly past the wall,
 * with a parapet round its edge.
 *
 * Returns the first free layer above the parapet, for a vent or an aerial.
 */
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
