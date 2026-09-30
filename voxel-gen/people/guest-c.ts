// The palette has no hair family on purpose: every hair is a step of a building ramp.
import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure, FIGURE_SCALE } from './figure.ts';

export default defineModel({
  id: 'guest-c',
  label: 'Guest in Blue',
  category: 'people',
  tiles: { x: 1, z: 1 },
  scale: FIGURE_SCALE,
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.base,
      hair: PALETTE.thatch.light,
      shirt: PALETTE.water.shade,
      sleeves: PALETTE.water.deep,
      legs: PALETTE.teak.shade,
      height: ADULT_VOXELS,
    });
  },
});
