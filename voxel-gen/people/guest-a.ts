import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure } from './figure.ts';

export default defineModel({
  id: 'guest-a',
  label: 'Guest',
  category: 'people',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.light,
      hair: PALETTE.teak.deep,
      shirt: PALETTE.stucco.base,
      legs: PALETTE.slate.shade,
      height: ADULT_VOXELS,
    });
  },
});
