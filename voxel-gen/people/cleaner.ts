import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure, FIGURE_SCALE } from './figure.ts';

export default defineModel({
  id: 'cleaner',
  label: 'Cleaner',
  category: 'people',
  tiles: { x: 1, z: 1 },
  scale: FIGURE_SCALE,
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.base,
      hair: PALETTE.metal.deep,
      // White under a teal cap: glass, which it wore before, is a guest's shirt too.
      shirt: PALETTE.stone.light,
      sleeves: PALETTE.stone.base,
      legs: PALETTE.metal.shade,
      cap: PALETTE.water.shade,
      height: ADULT_VOXELS,
    });
  },
});
