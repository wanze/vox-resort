/**
 * The ground an object stands on, and the way up onto it.
 *
 * Every model owns its own patch of ground: it is what makes an object read as
 * a plot rather than as a building dropped on a lawn, and it is also how a model
 * fills the footprint it claims (see `--audit`). These two parts are the ones
 * every model in the catalogue starts with.
 */

import { PALETTE, type Ramp } from '../palette.ts';
import type { VoxelBuilder } from '../voxelgen.ts';

export interface PlinthOptions {
  /** Corner of the slab, which is normally the model's own origin. */
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  /** Lowest layer. Defaults to the ground, which is where a model starts. */
  readonly y?: number;
  /** Layers. Three is 75 cm, the height the catalogue stands its objects on. */
  readonly height?: number;
  readonly stone?: Ramp;
}

/**
 * The slab an object stands on, with a darker lip around its top edge so the
 * plot has an outline of its own from every side.
 *
 * Returns the first free layer above it, which is where the building goes.
 */
export function plinth(b: VoxelBuilder, o: PlinthOptions): number {
  const height = o.height ?? 3;
  if (o.w < 3 || o.d < 3) throw new Error('A plinth is at least 3 voxels a side');
  if (height < 1) throw new Error('A plinth is at least one layer');

  const y = o.y ?? 0;
  const stone = o.stone ?? PALETTE.stone;
  const top = y + height - 1;
  const x1 = o.x + o.w - 1;
  const z1 = o.z + o.d - 1;

  b.box(o.x, x1, y, top, o.z, z1, stone.base);
  for (let x = o.x; x <= x1; x++) {
    b.set(x, top, o.z, stone.shade);
    b.set(x, top, z1, stone.shade);
  }
  for (let z = o.z; z <= z1; z++) {
    b.set(o.x, top, z, stone.shade);
    b.set(x1, top, z, stone.shade);
  }
  return top + 1;
}

/** Which way a flight of steps descends. */
export type Descent = 'x-' | 'x+' | 'z-' | 'z+';

export interface StepsOptions {
  /** Corner of the top tread, the end of the flight nearest the building. */
  readonly x: number;
  readonly z: number;
  /** Width across the flight. */
  readonly w: number;
  /** Layer the top tread's surface sits on. */
  readonly y: number;
  /** Treads, each one layer down and two voxels out. Two is a doorstep. */
  readonly treads?: number;
  /** The direction the flight descends, away from the door it serves. */
  readonly descends: Descent;
  readonly stone?: Ramp;
}

/**
 * A short flight down from a threshold, drawn on top of whatever it stands on.
 *
 * One voxel of rise to two of going, the same 25 by 50 cm tread the terraces
 * and the `stairs` model climb, so a doorstep and a terrace step are the same
 * step. Draw it after the ground it rests on: it paints over, it does not carve.
 */
export function steps(b: VoxelBuilder, o: StepsOptions): void {
  const treads = o.treads ?? 2;
  if (treads < 1) throw new Error('A flight has at least one tread');
  if (o.w < 1) throw new Error('A flight is at least one voxel wide');

  const stone = o.stone ?? PALETTE.stone;
  const floor = o.y - treads + 1;
  const along = o.descends === 'x-' || o.descends === 'x+' ? 'x' : 'z';
  const sign = o.descends === 'x+' || o.descends === 'z+' ? 1 : -1;

  for (let tread = 0; tread < treads; tread++) {
    const near = tread * 2 * sign;
    const far = near + sign;
    const lo = Math.min(near, far);
    const hi = Math.max(near, far);
    const level = o.y - tread;
    if (along === 'x') {
      b.box(o.x + lo, o.x + hi, floor, level, o.z, o.z + o.w - 1, stone.base);
    } else {
      b.box(o.x, o.x + o.w - 1, floor, level, o.z + lo, o.z + hi, stone.base);
    }
  }
}
