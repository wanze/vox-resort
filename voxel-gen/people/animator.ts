import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure } from './figure.ts';

export default defineModel({
  id: 'animator',
  label: 'Animator',
  category: 'people',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.base,
      hair: PALETTE.bloom.shade,
      // Loud where a cleaner is grey: lime is in no guest's wardrobe, so the show reads from afar.
      shirt: PALETTE.grass.light,
      legs: PALETTE.water.base,
      height: ADULT_VOXELS,
    });
  },
});
