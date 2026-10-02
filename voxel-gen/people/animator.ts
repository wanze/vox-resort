import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure, FIGURE_SCALE } from './figure.ts';

export default defineModel({
  id: 'animator',
  label: 'Animator',
  category: 'people',
  tiles: { x: 1, z: 1 },
  scale: FIGURE_SCALE,
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.base,
      hair: PALETTE.bloom.shade,
      // Loud where a cleaner is white: lime is in no guest's wardrobe, so the show reads from afar.
      shirt: PALETTE.grass.light,
      sleeves: PALETTE.grass.shade,
      legs: PALETTE.water.base,
      cap: PALETTE.amber.light,
      height: ADULT_VOXELS,
    });
  },
});
