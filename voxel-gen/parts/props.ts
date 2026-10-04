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

export interface PottedTreeOptions {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly pot?: Ramp;
  readonly leaf?: Ramp;
  readonly fruit?: Color;
}

// A clipped crown in flat courses round a 4x4 pot at x/z: a noisy crown costs more triangles
// than a whole plaza. It overhangs the pot by two voxels a side, from y + 8 up.
export function pottedTree(b: VoxelBuilder, o: PottedTreeOptions): void {
  const pot = o.pot ?? PALETTE.terracotta;
  const leaf = o.leaf ?? PALETTE.foliage;
  const { x, y, z } = o;

  b.box(x, x + 3, y, y + 2, z, z + 3, pot.shade);
  b.box(x, x + 3, y + 3, y + 3, z, z + 3, pot.base);
  b.box(x + 1, x + 2, y + 4, y + 7, z + 1, z + 2, PALETTE.teak.shade);
  b.box(x - 1, x + 4, y + 8, y + 8, z - 1, z + 4, leaf.shade);
  b.box(x - 2, x + 5, y + 9, y + 11, z - 2, z + 5, leaf.base);
  b.box(x - 1, x + 4, y + 12, y + 12, z - 1, z + 4, leaf.base);
  b.box(x, x + 3, y + 13, y + 13, z, z + 3, leaf.light);
  if (o.fruit === undefined) return;
  for (const [fx, fy, fz] of [
    [x - 2, y + 10, z],
    [x + 2, y + 11, z + 5],
    [x + 5, y + 9, z + 3],
    [x + 1, y + 9, z - 2],
  ] as const) {
    b.set(fx, fy, fz, o.fruit);
  }
}

export interface ClippedCypressOptions {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly height?: number;
  readonly leaf?: Ramp;
}

// A 4x4 column at x/z, the garden kind rather than the wild one in models/cypress.ts.
export function clippedCypress(b: VoxelBuilder, o: ClippedCypressOptions): void {
  const height = o.height ?? 18;
  const leaf = o.leaf ?? PALETTE.foliage;
  const { x, y, z } = o;
  const shoulder = y + height - 3;

  b.box(x + 1, x + 2, y, y + 1, z + 1, z + 2, PALETTE.teak.shade);
  b.box(x, x + 3, y + 2, shoulder, z, z + 3, leaf.shade);
  b.box(x + 1, x + 2, shoulder + 1, y + height - 1, z + 1, z + 2, leaf.base);
}

export interface PlanterOptions {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  readonly box?: Ramp;
  readonly leaf?: Ramp;
  readonly blooms?: readonly Color[];
}

// Flowers in 2x2 clumps on the leaves, six voxels apart: one per voxel would cost a quad each.
export function planter(b: VoxelBuilder, o: PlanterOptions): void {
  if (o.w < 2 || o.d < 2) throw new Error('A planter is at least 2 voxels a side');
  const box = o.box ?? PALETTE.terracotta;
  const leaf = o.leaf ?? PALETTE.foliage;
  const blooms = o.blooms ?? [PALETTE.bloom.base, PALETTE.amber.base];
  const x1 = o.x + o.w - 1;
  const z1 = o.z + o.d - 1;

  b.box(o.x, x1, o.y, o.y + 1, o.z, z1, box.shade);
  b.box(o.x, x1, o.y + 2, o.y + 2, o.z, z1, leaf.base);
  const alongX = o.w >= o.d;
  const length = alongX ? o.w : o.d;
  for (let at = 1, clump = 0; at + 1 < length; at += 6, clump++) {
    const cx = alongX ? o.x + at : o.x;
    const cz = alongX ? o.z : o.z + at;
    const color = blooms[clump % blooms.length]!;
    b.box(cx, alongX ? cx + 1 : x1, o.y + 3, o.y + 3, cz, alongX ? z1 : cz + 1, color);
  }
}
