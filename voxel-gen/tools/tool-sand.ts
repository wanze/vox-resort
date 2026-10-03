import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { EDGE, slab } from './ground.ts';

export default defineModel({
  id: 'tool-sand',
  label: 'Sand',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    slab(b, PALETTE.sand, PALETTE.sand.shade);
    for (let x = 0; x <= EDGE; x++) {
      for (let z = 0; z <= EDGE; z++) {
        if ((x + z) % 5 === 0) b.set(x, 2, z, PALETTE.sand.light);
        if ((x + z) % 5 === 1) b.set(x, 2, z, PALETTE.sand.base);
      }
    }
  },
});
