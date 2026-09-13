/**
 * The deck of a span: planking on a beam, trestles under it and a parapet up
 * both flanks.
 *
 * A part rather than a shape drawn in a model, for the reason `poolWater` is
 * one: two models wanted the same run of it. `bridge.ts` lays a single deck the
 * length of its tile and `bridge-ramp.ts` lays four of them at four heights to
 * make its treads, so a plank pitch, a rail height or the tone of a stringer
 * written twice is exactly the pair of numbers that drifts — and a crossing is
 * the one thing on the plot where two models butt end to end and the seam is at
 * eye level.
 *
 * It is drawn in the tile's own frame: `x` runs across the span and `z` along
 * it, so the planks lie across the run the way a real bridge's do and the
 * parapets stand on the two flanks you could fall off. Which way that is on the
 * plot is the placement's turn to say — see `layout/domain/spans.ts`.
 */

import { PALETTE, type Ramp } from '../palette.ts';
import { TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

/** Board pitch in voxels, the dark gap between two boards included; the jetty's. */
const BOARD_WIDTH = 4;

/**
 * The flank a parapet stands on, and the trestle under it, in voxels.
 *
 * Two, so a post has a plank either side of it to sit on and the trestle below
 * it reads as a leg rather than as a wire.
 */
const FLANK = 2;

/** Voxels the handrail stands above the planking. Four is a metre, as `railing.ts`. */
const RAIL_HEIGHT = 4;

/**
 * Voxels from one parapet post to the next.
 *
 * Five, which puts a post at each end of a tile and two between them. The rail
 * itself is one rectangle the whole length of the run whatever the pitch, so
 * what the posts cost is a handful of quads each and nothing else. See
 * `veranda.balustrade`, which is this run with the gaps filled in and is what a
 * stone terrace wants instead of it.
 */
const POST_PITCH = 5;

export interface SpanDeckOptions {
  /** The layer the planks are laid in; everything else is measured off it. */
  readonly y: number;
  /** First and last row of the run, along the crossing. */
  readonly z0: number;
  readonly z1: number;
  /**
   * The layer the trestles stand on: the bed of the water for a deck, and the
   * abutment for the lowest tread of a ramp. Level with the beam draws none.
   */
  readonly foot: number;
  readonly timber?: Ramp;
}

/**
 * One run of railed decking, the full width of a tile.
 *
 * The middle is left open under the planks on purpose: what says a deck is a
 * metre above the water is seeing the water run between its legs.
 */
export function spanDeck(b: VoxelBuilder, o: SpanDeckOptions): void {
  if (o.z1 < o.z0) throw new Error('A span deck covers at least one row');
  if (o.y < 1) throw new Error('A span deck has a beam under its planking');

  const timber = o.timber ?? PALETTE.teak;
  const N = TILE_VOXELS - 1;

  // The beam the planks are nailed to, spanning the whole tile so two tiles butt
  // together into one unbroken band of timber seen from the side.
  b.box(0, N, o.y - 1, o.y - 1, o.z0, o.z1, timber.deep);

  // Planking across the run, two tones alternating, which wraps: four boards to
  // a tile means the next tile carries the run on rather than restarting it.
  const boards = [timber.base, timber.shade] as const;
  for (let x = 0; x <= N; x++) {
    const board = x % BOARD_WIDTH === 0 ? timber.deep : boards[Math.floor(x / BOARD_WIDTH) % 2]!;
    b.box(x, x, o.y, o.y, o.z0, o.z1, board);
  }

  // The trestles: a stringer down each flank from the beam to `foot`.
  if (o.foot < o.y - 1) {
    b.box(0, FLANK - 1, o.foot, o.y - 2, o.z0, o.z1, timber.deep);
    b.box(N - FLANK + 1, N, o.foot, o.y - 2, o.z0, o.z1, timber.deep);
  }

  // The parapet up both flanks: a top rail the length of the run, a kick rail
  // under it, and posts standing between the two.
  const rail = o.y + RAIL_HEIGHT;
  for (const x of [0, N]) {
    b.box(x, x, rail, rail, o.z0, o.z1, timber.light);
    b.box(x, x, o.y + 1, o.y + 1, o.z0, o.z1, timber.shade);
    for (let z = o.z0; z <= o.z1; z++) {
      if (z % POST_PITCH === 0) b.box(x, x, o.y + 1, rail - 1, z, z, timber.shade);
    }
  }
}
