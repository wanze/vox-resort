import { PALETTE, type Ramp } from '../palette.ts';
import type { VoxelBuilder } from '../voxelgen.ts';

export interface PlinthOptions {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly y?: number;
  readonly height?: number;
  readonly stone?: Ramp;
}

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

export type Descent = 'x-' | 'x+' | 'z-' | 'z+';

export interface StepsOptions {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly y: number;
  readonly treads?: number;
  readonly descends: Descent;
  readonly stone?: Ramp;
}

// The same 1:2 rise to going as the terraces and stairs. Paints over rather than carves, so draw it after the ground.
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
