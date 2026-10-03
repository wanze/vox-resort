import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { slab, speckle } from './ground.ts';

export default defineModel({
  id: 'tool-raise',
  label: 'Raise',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    slab(b, PALETTE.grass);
    b.box(4, 11, 3, 4, 4, 11, PALETTE.teak.shade);
    for (let x = 4; x <= 11; x++) {
      for (let z = 4; z <= 11; z++) b.set(x, 5, z, speckle(PALETTE.grass, x, z));
    }
  },
});
