/**
 * The plain paper balloon, in the resort's own whitewash.
 *
 * The quiet one of the three, and the reason there are three: a sky of nothing
 * but red and gold is a firework display, and one balloon in plain paper among
 * them is what makes the other two read as somebody's choice.
 */
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
