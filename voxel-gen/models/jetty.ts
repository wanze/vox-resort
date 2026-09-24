// No rails of its own: railings.ts rails every paved edge over water, so the model
// never needs to know which tile of the pier it is. Boards run across x, the way
// the beams under a pier span.
import { PALETTE } from '../palette.ts';
import { defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

// Includes the dark gap between two boards.
const BOARD_WIDTH = 4;

export default defineModel({
  id: 'jetty',
  label: 'Jetty',
  category: 'grounds',
  groundDecides: true,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { teak } = PALETTE;

    const N = TILE_VOXELS - 1;
    // Two tones: four boards to a tile wraps cleanly, so a pier reads as one run of
    // planking rather than a row of stamped tiles.
    const boards = [teak.base, teak.shade] as const;

    box(0, N, 0, 0, 0, N, teak.deep);

    for (let x = 0; x <= N; x++) {
      if (x % BOARD_WIDTH === 0) {
        box(x, x, 1, 1, 0, N, teak.deep);
        continue;
      }
      box(x, x, 1, 1, 0, N, boards[Math.floor(x / BOARD_WIDTH) % boards.length]!);
    }
  },
});
