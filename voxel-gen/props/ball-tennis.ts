import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// One voxel, a quarter metre: four times a real ball, and still the smallest thing on the court.
export default defineModel({
  id: 'ball-tennis',
  label: 'Tennis Ball',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    b.set(0, 0, 0, PALETTE.grass.light);
  },
});
