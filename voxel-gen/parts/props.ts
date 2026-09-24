import { PALETTE, type Ramp } from '../palette.ts';
import type { Color, VoxelBuilder } from '../voxelgen.ts';

export interface PottedPlantOptions {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly size?: number;
  readonly pot?: Ramp;
  readonly leaf?: Ramp;
}

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
  readonly y: number;
  readonly w: number;
  readonly along: 'x' | 'z';
  readonly timber?: Ramp;
  readonly blooms?: readonly Color[];
}

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
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly height?: number;
  readonly reach?: number;
  readonly pole?: Ramp;
  readonly canvas?: Ramp;
}

// The canopy is flat on purpose: stepped rings read as a blob from above and
// the mesher cannot merge them.
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
