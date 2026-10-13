import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Bleached by the sea, so it does not pass for a teak plank off a deck.
export default defineModel({
  id: 'driftwood',
  label: 'Driftwood',
  category: 'litter',
  tiles: { x: 1, z: 1 },
  washedUp: true,
  build: (b: VoxelBuilder) => {
    const { stone, slate } = PALETTE;
    b.box(0, 2, 0, 0, 1, 1, stone.shade);
    b.set(2, 0, 0, slate.base);
    b.set(1, 1, 1, stone.base);
  },
});
