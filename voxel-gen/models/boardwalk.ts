// Exactly as tall as path.ts, so the two butt together without a step.
import { DECK_BOARD_DEPTH, DECKING } from '../parts/decking.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Four-voxel boards: a plank every two voxels is a pattern the greedy mesher cannot merge.
const BOARD_DEPTH = DECK_BOARD_DEPTH;

export default defineModel({
  id: 'boardwalk',
  label: 'Boardwalk',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);

    const C = DECKING;
    const boards = DECKING.boards;

    const N = 15;

    box(0, N, 0, 0, 0, N, C.joist);

    for (let z = 0; z <= N; z++) {
      if (z % BOARD_DEPTH === 0) {
        box(0, N, 1, 1, z, z, C.joist);
        continue;
      }
      box(0, N, 1, 1, z, z, boards[Math.floor(z / BOARD_DEPTH) % boards.length]!);
    }
  },
});
