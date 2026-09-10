/**
 * Water sunk into a deck.
 *
 * The part `docs/art-direction.md` has had on its list since the palette
 * landed, written now because the swimming pool asks for it three times in one
 * model — a long rectangle to swim lengths in, a round one for the children and
 * a small one under a slide. Three basins drawn by hand would be three slightly
 * different ideas of what a pool rim is.
 *
 * A pool is cut into ground that is already there: draw the {@link plinth}
 * first, then carve. What comes out is deliberately shallow — the water sits
 * one layer below the deck, which is all it takes to read as recessed from the
 * height the resort is ever seen at, and it keeps a pool from turning its plot
 * into a pit.
 *
 * The water is painted in one flat tone rather than rippled, because the
 * renderer shades it: a colour a model declares as water is meshed apart and
 * drawn with the sea's own shader, swell, glint and all. See
 * `src/features/rendering/adapters/poolWaterMaterial.ts`.
 */

import { PALETTE, type Ramp } from '../palette.ts';
import type { VoxelBuilder } from '../voxelgen.ts';

/** How a basin's outline is cut out of its rectangle. */
export type PoolShape = 'rect' | 'round';

export interface PoolWaterOptions {
  /** North-west corner of the basin, inclusive. */
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  /**
   * `round` inscribes an ellipse in the rectangle; `rect`, the default, keeps
   * the corners.
   */
  readonly shape?: PoolShape;
  /** Top layer of the deck the basin is sunk into. */
  readonly deck: number;
  /** Layers of water. Two is a pool to swim in, one a paddling pool. */
  readonly depth?: number;
  readonly water?: Ramp;
  /** The pale stone rim, drawn a ring either side of the water's edge. */
  readonly coping?: Ramp;
}

/**
 * Cuts a basin into a deck and fills it with water.
 *
 * The rim is two rings of coping — the last ring of the basin itself, which is
 * the wall the water stands against, and the first ring of deck outside it — so
 * leave a voxel of deck all the way round; a basin drawn hard against the edge
 * of its plinth paints its outer rim off the model and grows its footprint.
 *
 * Returns the layer the water's surface sits on, which is what a ladder, a
 * board or a slide is measured down to.
 */
/** The four sides a cell can have the basin's outline running along. */
const SIDES = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/**
 * Whether a cell falls inside the basin, which is the whole of what its shape
 * means: a rectangle is its own outline, and a round one is the ellipse
 * inscribed in it.
 *
 * Measured from voxel centres against the true centre of the rectangle, so an
 * ellipse comes out symmetric whether its axis is an odd or an even number of
 * voxels across.
 */
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

/** Every cell of the basin's rectangle, and the ring of deck around it. */
function* basinCells(o: PoolWaterOptions): Generator<readonly [number, number]> {
  for (let x = o.x - 1; x <= o.x + o.w; x++) {
    for (let z = o.z - 1; z <= o.z + o.d; z++) yield [x, z];
  }
}

export function poolWater(b: VoxelBuilder, o: PoolWaterOptions): number {
  const depth = o.depth ?? 2;
  if (o.w < 3 || o.d < 3) throw new Error('A pool is at least 3 voxels a side');
  if (depth < 1) throw new Error('A pool holds at least one layer of water');
  const floor = o.deck - depth;
  if (floor < 1) throw new Error('A pool needs a layer of ground under its floor');

  const water = o.water ?? PALETTE.water;
  const coping = o.coping ?? PALETTE.stone;
  const inside = outlineOf(o);

  /** Whether the outline runs between this cell and one of its four sides. */
  const rim = (x: number, z: number): boolean =>
    SIDES.some(([dx, dz]) => inside(x + dx, z + dz) !== inside(x, z));

  for (const [x, z] of basinCells(o)) {
    const wet = inside(x, z);
    // The rim is the outline seen from both sides: inside it, the wall the
    // water stands against, solid from the floor up; outside it, a cap on the
    // deck, so the pale stone runs a ring wider than the water it holds.
    if (rim(x, z)) {
      b.box(x, x, wet ? floor : o.deck, o.deck, z, z, coping.light);
    } else if (wet) {
      b.box(x, x, floor, o.deck - 1, z, z, water.base);
      // The layer the deck would have had, left open: this is the recess.
      b.del(x, o.deck, z);
    }
  }

  return o.deck - 1;
}
