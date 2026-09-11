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
 * which is also what an unattended boat's oars are actually doing.
 *
 * **Both thwarts are sat on**, and the boat is the reason the bay has anybody
 * afloat on it at all: a rower on the forward thwart, and a passenger on the
 * cushion in the stern. Which of the two is taken first is the order they are
 * declared in, because a boat with somebody in the stern and nobody at the oars
 * reads as a boat adrift. See `features/sea/domain/passengers.ts`.
 *
 * **Both of them look astern, and the shipped oars are the reason.** A rower
 * does anyway. The passenger would normally sit facing the bow, but a seated
 * figure's legs reach nearly three voxels forward of its hips at the height the
 * looms lie across the gunwales, so a forward-facing passenger in the stern is
 * a passenger with an oar through both shins. There is exactly one station
 * between the two thwarts that neither figure reaches, and a pair of oars needs
 * two. Facing them astern costs nothing anybody can object to: somebody sitting
 * in the stern with a hand in the water is an ordinary sight, and an oar
 * through a leg is not.
 */

import { PALETTE } from '../palette.ts';
import { hull, HULL_RIM } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** Voxels from transom to stem, and of beam either side of the keel. */
const LENGTH = 16;
const BEAM = 3;

/**
 * Stations the two thwarts are laid across, each of them two voxels deep.
 *
 * The after one carries the cushion and the forward one is the rowing thwart,
 * with the oars shipped either side of it.
 */
const AFT_THWART = 5;
const ROWING_THWART = 10;

export default defineModel({
  id: 'rowboat',
  label: 'Rowing Boat',
  category: 'sea',
  tiles: { x: 1, z: 1 },
  seats: [
    // The rower, on the after voxel of the rowing thwart and facing the stern,
    // which is the way somebody pulling an oar looks. The after voxel rather
    // than the forward one so the figure, which is two voxels deep, clears the
    // oar shipped across the gunwales just aft of it.
    { x: 0, y: HULL_RIM, z: ROWING_THWART + 1, facing: 2 },
    // The passenger in the stern, on the cushion rather than on the bare thwart,
    // which is the one course of difference between the two seats. Facing
    // astern, with their legs clear of the oars: see the note at the top.
    { x: 0, y: HULL_RIM + 1, z: AFT_THWART, facing: 2 },
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, stucco, teak } = PALETTE;

    const rim = hull(b, { x: 0, z: 0, y: 0, length: LENGTH, beam: BEAM, timber: teak });
    const thwart = rim - 1;

    // Two thwarts across the boat, on the gunwale course so they read as seats
    // spanning an open hull rather than as floorboards lying in the bottom of it.
    for (const z of [AFT_THWART, ROWING_THWART]) {
      box(-BEAM, BEAM, thwart, thwart, z, z + 1, teak.light);
    }

    // The oars, shipped one either side of the rowing thwart with their looms
    // across both gunwales and their blades out over the water.
    for (const z of [7, 9]) {
      box(-BEAM - 2, BEAM + 2, rim, rim, z, z, teak.base);
      for (const x of [-BEAM - 2, BEAM + 2]) b.set(x, rim, z, teak.light);
    }

    // A coil of rope in the bow and a cushion on the after thwart: the two
    // things that say somebody uses this boat.
    box(-1, 1, thwart, thwart, 12, 13, stucco.shade);
    box(-2, 2, rim, rim, AFT_THWART, AFT_THWART + 1, bloom.base);
  },
});
