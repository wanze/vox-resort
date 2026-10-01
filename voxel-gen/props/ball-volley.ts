import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'ball-volley',
  label: 'Volleyball',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { stucco, water } = PALETTE;
    b.box(0, 1, 0, 1, 0, 1, stucco.light);
    b.box(0, 1, 1, 1, 0, 0, water.base);
  },
});
