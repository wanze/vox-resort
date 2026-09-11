/**
 * A clinker rowing boat: an open hull with two thwarts across it, a pair of oars
 * shipped over the gunwales and a coil of rope in the bow. 7 x 5 x 16 voxels,
 * a 4 m boat. Bow towards +z.
 *
 * The hull is the shared part, so this is the thwarts and what is lying in them
 * and nothing else — see `parts/boat.ts`, which is also where the rule that
 * everything afloat is drawn from its waterline up is written down.
 *
 * **The oars are shipped rather than rowed.** A rowed oar is a diagonal, and a
 * diagonal on this grid is a staircase of single voxels that the mesher cannot
 * merge into anything; shipped, the pair is two straight runs across the boat,
 * which is also what an unattended boat's oars are actually doing. The thwarts
 * are where a rower will sit once the crowd can walk off the sand and onto the
 * water.
 */

import { PALETTE } from '../palette.ts';
import { hull } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** Voxels from transom to stem, and of beam either side of the keel. */
const LENGTH = 16;
const BEAM = 3;

export default defineModel({
  id: 'rowboat',
  label: 'Rowing Boat',
  category: 'sea',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, stucco, teak } = PALETTE;

    const rim = hull(b, { x: 0, z: 0, y: 0, length: LENGTH, beam: BEAM, timber: teak });
    const thwart = rim - 1;

    // Two thwarts across the boat, on the gunwale course so they read as seats
    // spanning an open hull rather than as floorboards lying in the bottom of it.
    for (const z of [5, 10]) box(-BEAM, BEAM, thwart, thwart, z, z + 1, teak.light);

    // The oars, shipped one either side of the rowing thwart with their looms
    // across both gunwales and their blades out over the water.
    for (const z of [7, 9]) {
      box(-BEAM - 2, BEAM + 2, rim, rim, z, z, teak.base);
      for (const x of [-BEAM - 2, BEAM + 2]) b.set(x, rim, z, teak.light);
    }

    // A coil of rope in the bow and a cushion on the after thwart: the two
    // things that say somebody uses this boat.
    box(-1, 1, thwart, thwart, 12, 13, stucco.shade);
    box(-2, 2, rim, rim, 5, 6, bloom.base);
  },
});
