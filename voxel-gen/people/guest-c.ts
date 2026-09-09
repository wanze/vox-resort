/**
 * A guest in blue. 3x7x2 voxels, facing +z.
 *
 * The fair hair is `thatch.light` rather than a blonde of its own: the palette
 * has no hair family, on purpose, because every hair the resort needs is
 * already a step of a ramp the buildings use. See `figure.ts`.
 */
import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure } from './figure.ts';

export default defineModel({
  id: 'guest-c',
  label: 'Guest in Blue',
  category: 'people',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.base,
      hair: PALETTE.thatch.light,
      shirt: PALETTE.water.shade,
      legs: PALETTE.teak.shade,
      height: ADULT_VOXELS,
    });
  },
});
