import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure, FIGURE_SCALE } from './figure.ts';

export default defineModel({
  id: 'guest-a',
  label: 'Guest',
  category: 'people',
  tiles: { x: 1, z: 1 },
  scale: FIGURE_SCALE,
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.light,
      hair: PALETTE.teak.deep,
      shirt: PALETTE.stucco.base,
      sleeves: PALETTE.stucco.shade,
      legs: PALETTE.slate.shade,
      height: ADULT_VOXELS,
    });
  },
});
