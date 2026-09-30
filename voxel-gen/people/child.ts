import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { CHILD_VOXELS, figure, FIGURE_SCALE } from './figure.ts';

export default defineModel({
  id: 'child',
  label: 'Child',
  category: 'people',
  tiles: { x: 1, z: 1 },
  scale: FIGURE_SCALE,
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.deep,
      hair: PALETTE.teak.base,
      shirt: PALETTE.amber.base,
      sleeves: PALETTE.amber.shade,
      legs: PALETTE.foliage.shade,
      height: CHILD_VOXELS,
    });
  },
});
