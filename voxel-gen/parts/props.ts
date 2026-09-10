/**
 * The small dressing that makes a plot look inhabited.
 *
 * In the reference renders the planting is the only high-frequency detail on an
 * otherwise calm building: a pot at each side of a door, a box under a window.
 * That is deliberate and worth copying — it puts the eye where the entrance is,
 * and it is the cheapest detail in the catalogue because it is a handful of
 * voxels rather than a pattern across a wall.
 *
 * The parasol is here on the same grounds. It is not architecture — it stands on
 * a terrace the way a pot does, it is the thing three models put over their
 * tables, loungers and daybeds, and what it is for is the same: somewhere for
 * the eye to land on a flat deck.
 */

import { PALETTE, type Ramp } from '../palette.ts';
import type { Color, VoxelBuilder } from '../voxelgen.ts';

export interface PottedPlantOptions {
  readonly x: number;
  readonly z: number;
  /** Layer the pot stands on. */
  readonly y: number;
  /** Edge of the pot in voxels. Two is a 50 cm terrace pot. */
  readonly size?: number;
  readonly pot?: Ramp;
  readonly leaf?: Ramp;
}

/** A potted palm: a terracotta pot with a rim, and greenery above it. */
export function pottedPlant(b: VoxelBuilder, o: PottedPlantOptions): void {
  const size = o.size ?? 2;
  if (size < 1) throw new Error('A pot is at least one voxel');
  const pot = o.pot ?? PALETTE.terracotta;
  const leaf = o.leaf ?? PALETTE.foliage;
  const x1 = o.x + size - 1;
  const z1 = o.z + size - 1;

  b.box(o.x, x1, o.y, o.y + 1, o.z, z1, pot.shade);
  b.box(o.x, x1, o.y + 2, o.y + 2, o.z, z1, pot.base);
  b.box(o.x, x1, o.y + 3, o.y + 4, o.z, z1, leaf.base);
  b.box(o.x, x1, o.y + 5, o.y + 5, o.z, z1, leaf.light);
}

export interface FlowerBoxOptions {
  readonly x: number;
  readonly z: number;
  /** Lowest layer of the planter. */
  readonly y: number;
  /** Length along `along`. */
  readonly w: number;
  /** The axis the box runs along; it is one voxel deep across the other. */
  readonly along: 'x' | 'z';
  readonly timber?: Ramp;
  /**
   * What grows in it, taken in turn along the box. Two greens make a planter,
   * the default three make it flower; a long box wants fewer colours or it
   * reads as bunting rather than as planting.
   */
  readonly blooms?: readonly Color[];
}

/**
 * A window box: a timber planter with red, yellow and green along its top.
 *
 * Three colours down a row of seven voxels is seven quads instead of one, which
 * is a rounding error here and would not be on a wall. See `roof.ts`.
 */
export function flowerBox(b: VoxelBuilder, o: FlowerBoxOptions): void {
  if (o.w < 1) throw new Error('A flower box is at least one voxel long');
  const timber = o.timber ?? PALETTE.teak;
  const bloom = o.blooms ?? [PALETTE.bloom.base, PALETTE.amber.base, PALETTE.foliage.base];
  if (bloom.length === 0) throw new Error('A flower box grows at least one thing');

  for (let step = 0; step < o.w; step++) {
    const x = o.along === 'x' ? o.x + step : o.x;
    const z = o.along === 'z' ? o.z + step : o.z;
    b.box(x, x, o.y, o.y + 1, z, z, timber.deep);
    b.set(x, o.y + 2, z, bloom[step % bloom.length]!);
  }
}

export interface ParasolOptions {
  /** The column the pole stands in; the canopy is centred on it. */
  readonly x: number;
  readonly z: number;
  /** Layer the pole stands on. */
  readonly y: number;
  /** Clear layers of pole under the canopy. Eight is 2 m of headroom. */
  readonly height?: number;
  /** Voxels the canopy reaches out from the pole. Two is a 1.25 m square. */
  readonly reach?: number;
  readonly pole?: Ramp;
  readonly canvas?: Ramp;
}

/**
 * A parasol: a pole up through the middle of one flat square of canvas, with a
 * finial over it.
 *
 * The canopy is a plane and nothing else, which is the whole reason this is a
 * part. Both models it is lifted from used to build theirs as four stepped
 * rings of two alternating colours — a dome nobody can make out the shape of
 * from a camera looking down at 30 degrees, and the one pattern the mesher
 * cannot merge. Flat, it is six quads whatever its reach.
 *
 * It is also the part `docs/art-direction.md` picked out of the restaurant
 * pass: a terrace that cannot carry a pergola can carry a parasol, because a
 * canopy 2 m up hides nothing of what is behind it and a frame does.
 */
export function parasol(b: VoxelBuilder, o: ParasolOptions): void {
  const height = o.height ?? 8;
  const reach = o.reach ?? 2;
  if (height < 1) throw new Error('A parasol stands on at least one layer of pole');
  if (reach < 1) throw new Error('A parasol reaches at least one voxel past its pole');

  const pole = o.pole ?? PALETTE.teak;
  const canvas = o.canvas ?? PALETTE.amber;
  const canopy = o.y + height;

  b.box(o.x, o.x, o.y, canopy - 1, o.z, o.z, pole.base);
  b.box(o.x - reach, o.x + reach, canopy, canopy, o.z - reach, o.z + reach, canvas.base);
  b.set(o.x, canopy + 1, o.z, pole.shade);
}
