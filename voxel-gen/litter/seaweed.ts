import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// A tangle rather than a strand, so it reads as weed and not a dropped stick.
export default defineModel({
  id: 'seaweed',
  label: 'Washed-up Seaweed',
  category: 'litter',
  tiles: { x: 1, z: 1 },
  washedUp: true,
  build: (b: VoxelBuilder) => {
    const { foliage, grass } = PALETTE;
    b.box(0, 2, 0, 0, 1, 1, foliage.shade);
    b.set(0, 0, 0, foliage.deep);
    b.set(2, 0, 2, grass.shade);
    b.set(1, 0, 2, foliage.deep);
    b.set(1, 1, 1, foliage.base);
  },
});
