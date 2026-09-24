import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { lantern, lanternGlow } from './lantern.ts';

export default defineModel({
  id: 'balloon-paper',
  label: 'Lucky Balloon',
  category: 'sky',
  tiles: { x: 1, z: 1 },
  emissive: lanternGlow(PALETTE.stucco),
  build: (b: VoxelBuilder) => lantern(b, { paper: PALETTE.stucco }),
});
