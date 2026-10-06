import { PALETTE } from '../palette.ts';
import { hull } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const LENGTH = 18;
const BEAM = 3;

const HELM = 7;
const SCREEN = 11;

export default defineModel({
  id: 'speedboat',
  label: 'Speedboat',
  category: 'sea',
  tiles: { x: 1, z: 2 },
  // To port of the wheel, as the one seat a tow boat needs is the driver's.
  seats: [{ x: -1, y: 3, z: HELM, facing: 0, pose: 'sit' }],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, glass, metal, slate, stucco, water } = PALETTE;

    const rim = hull(b, {
      x: 0,
      z: 0,
      y: 0,
      length: LENGTH,
      beam: BEAM,
      timber: stucco,
      stripe: water,
    });
    const deck = rim - 1;

    box(-2, 2, deck, deck, SCREEN + 1, 14, stucco.light);
    box(-1, 1, deck, deck, 15, 16, stucco.light);

    box(-2, 2, deck - 1, deck, SCREEN, SCREEN, slate.shade);
    box(-2, 2, rim, rim + 1, SCREEN, SCREEN, glass.light);
    b.set(-1, rim, SCREEN - 1, metal.base);

    box(-2, 0, deck - 1, deck - 1, HELM - 1, HELM, bloom.base);
    box(-2, 2, deck - 1, deck - 1, 2, 3, bloom.base);

    // The rope's post, at the transom so the banana swings from the stern.
    box(0, 0, deck, rim + 1, 1, 1, metal.base);
    b.set(0, rim + 1, 1, metal.light);
  },
});
