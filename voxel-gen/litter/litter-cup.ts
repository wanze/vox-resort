import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Oversized for a paper cup, as the balloons are: drawn to scale it would be one voxel on a tile.
export default defineModel({
  id: 'litter-cup',
  label: 'Dropped Cup',
  category: 'litter',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { stucco, bloom } = PALETTE;
    b.box(0, 1, 0, 2, 0, 1, stucco.light);
    b.box(0, 1, 1, 1, 0, 1, bloom.base);
    b.set(0, 3, 0, stucco.shade);
  },
});
