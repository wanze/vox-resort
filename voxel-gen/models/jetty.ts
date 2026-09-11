/**
 * Jetty tile: the paving the resort uses where a path crosses water — a deck of
 * wet timber on beams, boarded across the run so a pier reads as planked.
 * 16x16 footprint, fits a 1x1 ground tile.
 *
 * Exactly as tall as `path.ts` and `boardwalk.ts`, so the three butt together
 * without a step where a street runs off the grass, over the sand and out onto
 * the water. The bottom course is the one anybody ever sees from the side: the
 * sea surface sits a tenth of a voxel above the seabed, so a jetty stands very
 * nearly two voxels proud of the water and that dark band of beam is the side of
 * the pier.
 *
 * Nobody picks it, for the reason nobody picks decking: the palette offers
 * `path`, and a path laid on water comes out as this. See `groundDecides` below,
 * and `boardwalk.ts` and `stairs.ts`, which are the other two pavings the ground
 * chooses.
 *
 * **A jetty has no rails of its own.** It gets them the way the top of a terrace
 * does — `railings.ts` stands a handrail along every paved edge you could walk
 * off, and water counts as a drop. That is what keeps a pier's rails to its
 * actual edges: a tile in the middle of a two-wide pier is fenced off from
 * nothing, and the head of a pier is railed on three sides, without this model
 * knowing which tile it is.
 *
 * The boards run across the tile's x rather than along it, which is the one way
 * this differs in shape from the boardwalk: decking laid over sand runs with the
 * shore, and decking laid over water runs across the pier, because that is the
 * way the beams under it span. The pitch is the boardwalk's — a four-voxel board
 * with a one-voxel gap, the coarsest planking the greedy mesher can still merge
 * into rectangles.
 */
import { PALETTE } from '../palette.ts';
import { defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

/** Board pitch in voxels, the dark gap between two boards included. */
const BOARD_WIDTH = 4;

export default defineModel({
  id: 'jetty',
  label: 'Jetty',
  category: 'grounds',
  // Never picked: a jetty is what a path becomes on water, so the palette leaves
  // it out and the paving lays it. See `groundDecides`.
  groundDecides: true,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { teak } = PALETTE;

    const N = TILE_VOXELS - 1;
    // Two tones alternating, which wraps: four boards to a tile means the next
    // tile starts on the same tone the last one would have carried on with, so a
    // pier is one run of planking rather than a row of stamped tiles with a seam
    // between each pair. A third tone is what the boardwalk can afford on sand,
    // where the tiles are laid in a band rather than in a line.
    const boards = [teak.base, teak.shade] as const;

    // The beams under the deck, spanning the full tile so tiles butt together
    // and so the side of the pier is one unbroken band above the water.
    box(0, N, 0, 0, 0, N, teak.deep);

    // Decking on top: boards across x, a dark gap between each pair.
    for (let x = 0; x <= N; x++) {
      if (x % BOARD_WIDTH === 0) {
        box(x, x, 1, 1, 0, N, teak.deep);
        continue;
      }
      box(x, x, 1, 1, 0, N, boards[Math.floor(x / BOARD_WIDTH) % boards.length]!);
    }
  },
});
