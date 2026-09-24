import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { lantern, lanternGlow } from './lantern.ts';

export default defineModel({
  id: 'balloon-bloom',
  label: 'Lucky Balloon',
  category: 'sky',
  tiles: { x: 1, z: 1 },
  emissive: lanternGlow(PALETTE.bloom),
  build: (b: VoxelBuilder) => lantern(b, { paper: PALETTE.bloom }),
});
