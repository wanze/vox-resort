/**
 * Boardwalk tile: the paving the resort uses where a path crosses sand — a slab
 * of weathered decking boards running east to west over two joists.
 * 16x16 footprint, fits a 1x1 ground tile.
 *
 * Exactly as tall as `path.ts`, so the two butt together without a step where a
 * street runs off the grass and onto the beach.
 *
 * The board pitch is chosen the same way the flagstones were, and for the same
 * reason: this is a tile the layout repeats a few hundred times along a shore,
 * and a plank every two voxels is the pattern the greedy mesher cannot merge.
 * Four-voxel boards with a one-voxel gap read as decking from the height the
 * ground is ever seen at and cost a quarter of what one-voxel planking would.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** Board pitch in voxels, the dark gap between two boards included. */
const BOARD_DEPTH = 4;

export default defineModel({
  id: 'boardwalk',
  label: 'Boardwalk',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);

    const C = {
      joist: 0x6b563c,
      boardA: 0xb98f5f,
      boardB: 0xa87f52,
      boardC: 0xc59a68,
    };
    const boards = [C.boardA, C.boardB, C.boardC];

    const N = 15;

    // the joists under the deck, spanning the full tile so tiles butt together
    box(0, N, 0, 0, 0, N, C.joist);

    // decking on top: boards along x, a dark gap between each pair
    for (let z = 0; z <= N; z++) {
      if (z % BOARD_DEPTH === 0) {
        box(0, N, 1, 1, z, z, C.joist);
        continue;
      }
      box(0, N, 1, 1, z, z, boards[Math.floor(z / BOARD_DEPTH) % boards.length]!);
    }
  },
});
