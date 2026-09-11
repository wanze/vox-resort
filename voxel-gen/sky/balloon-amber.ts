/**
 * The gold lucky balloon. The warmest of the three, and the one that reads
 * furthest against a deep blue sky.
 */
import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { lantern, lanternGlow } from './lantern.ts';

export default defineModel({
  id: 'balloon-amber',
  label: 'Lucky Balloon',
  category: 'sky',
  tiles: { x: 1, z: 1 },
  emissive: lanternGlow(PALETTE.amber),
  build: (b: VoxelBuilder) => lantern(b, { paper: PALETTE.amber }),
});
