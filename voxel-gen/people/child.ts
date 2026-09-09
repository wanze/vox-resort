/**
 * A child: the same figure a voxel shorter. 3x6x2 voxels, facing +z.
 *
 * The voxel comes off the legs rather than off the head, which is most of what
 * makes a small figure read as a child instead of as an adult further away.
 */
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
