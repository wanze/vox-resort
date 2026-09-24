// Water is painted one flat tone: the renderer shades water colours with the sea's shader.

import { PALETTE, type Ramp } from '../palette.ts';
import type { VoxelBuilder } from '../voxelgen.ts';

export type PoolShape = 'rect' | 'round';

export interface PoolWaterOptions {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly shape?: PoolShape;
  readonly deck: number;
  readonly depth?: number;
  readonly water?: Ramp;
  readonly coping?: Ramp;
}

const SIDES = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

// Measured from voxel centres against the true centre, so the ellipse is symmetric for odd and even
// widths.
function outlineOf(o: PoolWaterOptions): (x: number, z: number) => boolean {
  const x1 = o.x + o.w - 1;
  const z1 = o.z + o.d - 1;
  if ((o.shape ?? 'rect') === 'rect') {
    return (x, z) => x >= o.x && x <= x1 && z >= o.z && z <= z1;
  }
  const centerX = o.x + o.w / 2;
  const centerZ = o.z + o.d / 2;
  return (x, z) => {
    const u = (x + 0.5 - centerX) / (o.w / 2);
    const v = (z + 0.5 - centerZ) / (o.d / 2);
    return u * u + v * v <= 1;
  };
}

function* basinCells(o: PoolWaterOptions): Generator<readonly [number, number]> {
  for (let x = o.x - 1; x <= o.x + o.w; x++) {
    for (let z = o.z - 1; z <= o.z + o.d; z++) yield [x, z];
  }
}

// Leave a voxel of deck all round: a basin against the plinth edge paints its outer rim off the
// model. Returns the layer the water surface sits on.
export function poolWater(b: VoxelBuilder, o: PoolWaterOptions): number {
  const depth = o.depth ?? 2;
  if (o.w < 3 || o.d < 3) throw new Error('A pool is at least 3 voxels a side');
  if (depth < 1) throw new Error('A pool holds at least one layer of water');
  const floor = o.deck - depth;
  if (floor < 1) throw new Error('A pool needs a layer of ground under its floor');

  const water = o.water ?? PALETTE.water;
  const coping = o.coping ?? PALETTE.stone;
  const inside = outlineOf(o);

  const rim = (x: number, z: number): boolean =>
    SIDES.some(([dx, dz]) => inside(x + dx, z + dz) !== inside(x, z));

  for (const [x, z] of basinCells(o)) {
    const wet = inside(x, z);
    // The rim is the outline seen from both sides: the basin wall inside, a cap on the deck
    // outside.
    if (rim(x, z)) {
      b.box(x, x, wet ? floor : o.deck, o.deck, z, z, coping.light);
    } else if (wet) {
      b.box(x, x, floor, o.deck - 1, z, z, water.base);
      b.del(x, o.deck, z);
    }
  }

  return o.deck - 1;
}
