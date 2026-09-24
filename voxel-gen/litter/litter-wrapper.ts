import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Crumpled rather than flat, so it catches the light off the paving it lies on.
export default defineModel({
  id: 'litter-wrapper',
  label: 'Dropped Wrapper',
  category: 'litter',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { amber, bloom } = PALETTE;
    b.box(0, 2, 0, 0, 0, 1, amber.base);
    b.set(1, 0, 2, amber.shade);
    b.set(1, 1, 1, bloom.base);
    b.set(2, 1, 0, amber.light);
  },
});
