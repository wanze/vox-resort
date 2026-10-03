import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { EDGE, scatter, slab } from './ground.ts';

const RIM = 2;

export default defineModel({
  id: 'tool-water',
  label: 'Water',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    slab(b, PALETTE.sand, PALETTE.sand.shade);
    for (let x = RIM; x <= EDGE - RIM; x++) {
      for (let z = RIM; z <= EDGE - RIM; z++) {
        b.del(x, 2, z);
        b.set(x, 1, z, scatter(x, z) < 2 ? PALETTE.water.light : PALETTE.water.base);
      }
    }
  },
});
