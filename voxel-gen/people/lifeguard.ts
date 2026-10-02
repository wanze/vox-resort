import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure, FIGURE_SCALE } from './figure.ts';

export default defineModel({
  id: 'lifeguard',
  label: 'Lifeguard',
  category: 'people',
  tiles: { x: 1, z: 1 },
  scale: FIGURE_SCALE,
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.shade,
      hair: PALETTE.thatch.base,
      // Yellow over red, the colours a lifeguard wears on any beach, read before the tower does.
      // Thatch rather than amber, which a child wears.
      shirt: PALETTE.thatch.light,
      sleeves: PALETTE.thatch.shade,
      legs: PALETTE.bloom.base,
      cap: PALETTE.bloom.base,
      height: ADULT_VOXELS,
    });
  },
});
