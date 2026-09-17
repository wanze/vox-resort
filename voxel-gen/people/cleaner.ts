/**
 * A cleaner in a work shirt. 3x7x2 voxels, facing +z.
 *
 * The `glass` ramp for the shirt and `metal` for the trousers: the two coolest,
 * greyest families the palette has, against the `bloom`, `water` and `amber`
 * every guest is dressed in. From the isometric camera a figure is a dozen
 * voxels of colour, so the only thing that can say "staff" at that size is a
 * shirt nobody on holiday would wear.
 */
import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, figure } from './figure.ts';

export default defineModel({
  id: 'cleaner',
  label: 'Cleaner',
  category: 'people',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    figure(b, {
      skin: PALETTE.skin.base,
      hair: PALETTE.metal.deep,
      shirt: PALETTE.glass.base,
      legs: PALETTE.metal.shade,
      height: ADULT_VOXELS,
    });
  },
});
