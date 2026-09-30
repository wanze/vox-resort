import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure, FIGURE_SCALE } from './figure.ts';

export default defineModel({
  id: 'guest-b',
  label: 'Guest in Red',
  category: 'people',
  tiles: { x: 1, z: 1 },
  scale: FIGURE_SCALE,
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.shade,
      hair: PALETTE.metal.deep,
      shirt: PALETTE.bloom.base,
      sleeves: PALETTE.bloom.shade,
      legs: PALETTE.stucco.shade,
      height: ADULT_VOXELS,
    });
  },
});
