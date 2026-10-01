import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'ball-basket',
  label: 'Basketball',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    b.box(0, 1, 0, 1, 0, 1, PALETTE.amber.shade);
  },
});
