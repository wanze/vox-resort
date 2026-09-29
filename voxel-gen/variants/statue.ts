import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'statue-b',
  label: 'Statue B',
  category: 'grounds',
  scenery: 0.8,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { sand, stone, stucco, terracotta } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 16, d: 16, height: 2, stone: sand });

    b.box(3, 12, ground, ground, 3, 12, stone.base);
    b.box(5, 10, ground + 1, ground + 4, 5, 10, stone.light);
    b.box(4, 11, ground + 5, ground + 5, 4, 11, stone.base);

    // A draped water bearer: the robe falls to the feet as one block, which is
    // both how the marble would be carved and the cheapest figure to mesh.
    const feet = ground + 6;
    const marble = stucco.light;
    b.box(6, 9, feet, feet + 1, 6, 9, marble);
    b.box(6, 9, feet + 2, feet + 8, 7, 8, marble);
    b.box(5, 10, feet + 9, feet + 10, 7, 8, marble);
    b.box(7, 8, feet + 11, feet + 13, 7, 8, marble);
    b.box(10, 10, feet + 4, feet + 8, 7, 8, marble);
    b.box(4, 4, feet + 7, feet + 10, 7, 8, marble);

    // On the shoulder the camera faces, and the one warm thing on the figure, so
    // the jar reads at any distance.
    b.box(4, 6, feet + 11, feet + 13, 7, 8, terracotta.base);
    b.box(5, 5, feet + 14, feet + 14, 7, 8, terracotta.shade);
  },
});
