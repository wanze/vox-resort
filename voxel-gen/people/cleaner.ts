import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure } from './figure.ts';

export default defineModel({
  id: 'cleaner',
  label: 'Cleaner',
  category: 'people',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.base,
      hair: PALETTE.metal.deep,
      // Cool greys against the warm colours guests wear, so the figure reads as staff.
      shirt: PALETTE.glass.base,
      legs: PALETTE.metal.shade,
      height: ADULT_VOXELS,
    });
  },
});
