import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { CHILD_VOXELS, figure } from './figure.ts';

export default defineModel({
  id: 'child',
  label: 'Child',
  category: 'people',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.deep,
      hair: PALETTE.teak.base,
      shirt: PALETTE.amber.base,
      legs: PALETTE.foliage.shade,
      height: CHILD_VOXELS,
    });
  },
});
