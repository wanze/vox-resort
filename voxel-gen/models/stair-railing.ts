/**
 * Stair balustrade: a stepped parapet up both flanks of a flight, capped with a
 * handrail that climbs with the treads. 16x16, laid over the stair tile it
 * guards.
 *
 * **Where it stands.** On the flight itself, turned the way the flight climbs —
 * so it takes `stairs.ts`'s own rotation and needs no rule of its own about
 * which way round it goes. Both flanks are in the one model on purpose: a
 * balustrade up one side of a staircase is a mirror of the one up the other, and
 * a mirror is not a quarter turn. One model with both is the only shape a single
 * geometry can cover all four climbs in.
 *
 * **Why it lines up.** The treads are derived here exactly as they are in
 * `stairs.ts` — the same rise, the same going, taken off the same two
 * constants — so the parapet steps with the flight rather than beside it. Get
 * one of them wrong and `stairs.test.ts` says so.
 *
 * It is drawn as a solid parapet rather than as posts and a rail because a
 * staircase is a tile deep: an open handrail up a flight would be eight pickets
 * two voxels apart, which at this scale is a comb. A wall with a lighter cap
 * reads as masonry, and the greedy mesher merges each flank into a handful of
 * rectangles.
 */
import { defineModel, LEVEL_VOXELS, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

/** Top surface of a path slab, which the lowest tread stands one above. */
const PAVING_TOP = 2;

/** One voxel of rise per tread, as `stairs.ts` is authored. */
const TREADS = LEVEL_VOXELS;

/** How deep one tread is, so the flight fills the tile exactly. */
const GOING = TILE_VOXELS / TREADS;

/** How far the parapet stands above the tread it guards. */
const RAIL_HEIGHT = 4;

/** How wide one flank is, out of the tile. */
const FLANK = 2;

export default defineModel({
  id: 'stair-railing',
  label: 'Stair Balustrade',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: it is what the sides of a flight are, and a flight is itself
  // what a path becomes where it climbs. See `groundDecides`.
  groundDecides: true,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);

    const C = {
      wall: 0xbfae87,
      cap: 0xe4d9c4,
    };

    // Highest tread first, at the north edge, descending south — the order
    // `stairs.ts` builds in, so the two agree tread for tread.
    for (let step = 0; step < TREADS; step++) {
      const tread = PAVING_TOP + LEVEL_VOXELS - 1 - step;
      const z0 = step * GOING;
      const z1 = z0 + GOING - 1;
      for (const x0 of [0, TILE_VOXELS - FLANK]) {
        const x1 = x0 + FLANK - 1;
        box(x0, x1, 0, tread + RAIL_HEIGHT - 1, z0, z1, C.wall);
        box(x0, x1, tread + RAIL_HEIGHT, tread + RAIL_HEIGHT, z0, z1, C.cap);
      }
    }
  },
});
