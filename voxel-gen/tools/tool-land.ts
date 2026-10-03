import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { EDGE, slab } from './ground.ts';

const STAKES = [1, EDGE - 1];

export default defineModel({
  id: 'tool-land',
  label: 'Land',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    slab(b, PALETTE.sand, PALETTE.sand.shade);
    for (const x of STAKES) {
      for (const z of STAKES) b.box(x, x, 3, 6, z, z, PALETTE.teak.base);
    }
    // A string between the stakes marks the parcel's edge, which is what the tool is about.
    for (let i = 1; i <= EDGE - 1; i++) {
      for (const edge of STAKES) {
        b.set(i, 5, edge, PALETTE.terracotta.base);
        b.set(edge, 5, i, PALETTE.terracotta.base);
      }
    }
    b.box(8, 8, 3, 9, 8, 8, PALETTE.teak.shade);
    b.box(5, 11, 8, 11, 7, 7, PALETTE.stucco.base);
    b.box(6, 10, 10, 10, 6, 6, PALETTE.terracotta.shade);
  },
});
