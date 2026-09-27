import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure } from './figure.ts';

export default defineModel({
  id: 'lifeguard',
  label: 'Lifeguard',
  category: 'people',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.shade,
      hair: PALETTE.thatch.base,
      // Yellow over red, the colours a lifeguard wears on any beach, read before the tower does.
      shirt: PALETTE.amber.light,
      legs: PALETTE.bloom.base,
      height: ADULT_VOXELS,
    });
  },
});
