import { PALETTE } from '../palette.ts';
import { hull, HULL_RIM } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const LENGTH = 20;
const BEAM = 3;

const STEP = 13;
const MAST = 16;

const HELM_THWART = 4;

const FOOT = 9;
// One voxel of belly: two made the sail a staircase, and none leaves it
// edge on (invisible) from two headings.
const DRAUGHT = 1;

// A trapezoid, not a triangle: a triangle steps a voxel every course, which
// the mesher cannot merge.
const SHOULDER = 0.5;

export default defineModel({
  id: 'sailboat',
  label: 'Sailing Dinghy',
  category: 'sea',
  tiles: { x: 1, z: 2 },
  // Port is the only thwart column where a figure clears both the gunwale and the boom.
  seats: [{ x: -1, y: HULL_RIM, z: HELM_THWART, facing: 0 }],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, stucco, teak } = PALETTE;

    const rim = hull(b, { x: 0, z: 0, y: 0, length: LENGTH, beam: BEAM, timber: teak });

    box(-BEAM, BEAM, rim - 1, rim - 1, HELM_THWART, HELM_THWART + 1, teak.light);
    box(0, 0, rim, rim, 1, 3, teak.base);

    const head = rim + MAST;
    box(0, 0, rim, head, STEP, STEP, teak.base);
    const boom = rim + 2;
    box(1, 1, boom, boom, STEP - FOOT, STEP - 1, teak.shade);

    const shoulder = boom + Math.round((head - boom) * SHOULDER);
    for (let y = boom + 1; y < head; y++) {
      const reach =
        y <= shoulder ? FOOT : Math.max(1, Math.round((FOOT * (head - y)) / (head - shoulder)));
      for (let aft = 1; aft <= reach; aft++) {
        // Belly from the foot, not this course's reach, so each column stays one vertical plane.
        const belly = Math.round(Math.sin((Math.PI * aft) / (FOOT + 1)) * DRAUGHT);
        b.set(1 + belly, y, STEP - aft, y === boom + 5 ? bloom.base : stucco.light);
      }
    }
  },
});
