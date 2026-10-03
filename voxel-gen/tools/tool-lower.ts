import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { slab } from './ground.ts';

export default defineModel({
  id: 'tool-lower',
  label: 'Lower',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    slab(b, PALETTE.grass);
    for (let x = 3; x <= 12; x++) {
      for (let z = 3; z <= 12; z++) {
        b.del(x, 2, z);
        b.del(x, 1, z);
        b.set(x, 0, z, PALETTE.grass.shade);
      }
    }
  },
});
