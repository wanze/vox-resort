import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { EDGE, scatter, slab } from './ground.ts';

export default defineModel({
  id: 'tool-grass',
  label: 'Grass',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    slab(b, PALETTE.grass);
    // Tufts stand proud of the slab: a flat green reads as paint, a tuft as grass.
    for (let x = 1; x < EDGE; x++) {
      for (let z = 1; z < EDGE; z++) {
        const roll = scatter(z, x);
        if (roll === 0) b.box(x, x, 3, 4, z, z, PALETTE.grass.light);
        if (roll === 1) b.set(x, 3, z, PALETTE.foliage.base);
      }
    }
  },
});
