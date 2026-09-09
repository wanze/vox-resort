/**
 * A guest in a white shirt: the resort's default figure, and the one the crowd
 * is mostly made of. 3x7x2 voxels, facing +z.
 *
 * Stucco is the resort's own whitewash, so this person is dressed in the same
 * colour as the buildings they walk between — which is exactly what a linen
 * shirt in this light looks like, and what keeps the crowd inside the palette.
 */
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
