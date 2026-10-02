import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure, FIGURE_SCALE } from './figure.ts';

export default defineModel({
  id: 'mechanic',
  label: 'Mechanic',
  category: 'people',
  tiles: { x: 1, z: 1 },
  scale: FIGURE_SCALE,
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.base,
      hair: PALETTE.teak.deep,
      // One colour head to foot reads as overalls; terracotta is in no guest's wardrobe.
      shirt: PALETTE.terracotta.base,
      sleeves: PALETTE.terracotta.shade,
      legs: PALETTE.terracotta.base,
      // Slate, not metal: a near-black cap reads as the dark hair a guest has.
      cap: PALETTE.slate.deep,
      height: ADULT_VOXELS,
    });
  },
});
