import { PALETTE } from '../palette.ts';
import { hull, HULL_RIM } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const LENGTH = 16;
const BEAM = 3;

const AFT_THWART = 5;
const ROWING_THWART = 10;

export default defineModel({
  id: 'rowboat',
  label: 'Rowing Boat',
  category: 'sea',
  tiles: { x: 1, z: 1 },
  seats: [
    // Seats fill in declaration order: rower first, since a boat manned only in the stern reads as
    // adrift. The after voxel of the thwart, so the two-voxel-deep figure clears the oar.
    { x: 0, y: HULL_RIM, z: ROWING_THWART + 1, facing: 2 },
    // Faces astern: facing the bow, the legs would pass through the shipped oars.
    { x: 0, y: HULL_RIM + 1, z: AFT_THWART, facing: 2 },
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, stucco, teak } = PALETTE;

    const rim = hull(b, { x: 0, z: 0, y: 0, length: LENGTH, beam: BEAM, timber: teak });
    const thwart = rim - 1;

    // On the gunwale course so they read as seats, not floorboards.
    for (const z of [AFT_THWART, ROWING_THWART]) {
      box(-BEAM, BEAM, thwart, thwart, z, z + 1, teak.light);
    }

    // Shipped, not rowed: a diagonal oar is a staircase of voxels the mesher cannot merge.
    for (const z of [7, 9]) {
      box(-BEAM - 2, BEAM + 2, rim, rim, z, z, teak.base);
      for (const x of [-BEAM - 2, BEAM + 2]) b.set(x, rim, z, teak.light);
    }

    box(-1, 1, thwart, thwart, 12, 13, stucco.shade);
    box(-2, 2, rim, rim, AFT_THWART, AFT_THWART + 1, bloom.base);
  },
});
