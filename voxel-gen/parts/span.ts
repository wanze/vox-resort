/**
 * The pieces of a span: planking on a beam, the piles under it, and the parapet
 * that stands along an edge you could fall off — with the trestle below it and
 * the lantern on top.
 *
 * A part rather than shapes drawn in each model, for the reason `poolWater` is
 * one: five models want the same runs of it. `bridge.ts` lays a single deck the
 * length of its tile and `bridge-ramp.ts` lays four of them at four heights to
 * make its treads, and the three bridge railings stand the parapet along them —
 * so a plank pitch, a rail height or the tone of a stringer written twice is
 * exactly the pair of numbers that drifts, and a crossing is the one thing on
 * the plot where several models butt together at eye level.
 *
 * **The deck and its parapet are separate models**, and that is what lets a
 * crossing have a junction in it. A deck that drew its own parapet had to draw
 * it on both flanks whatever stood beside it, so where two crossings met, or
 * where a crossing was widened into a platform, a rail ran straight across the
 * way through. Now `railings.ts` stands a bridge railing along exactly the edges
 * that have nothing paved beyond them, the way it already rails a pier.
 *
 * The deck is drawn in the tile's own frame: `x` runs across the span and `z`
 * along it, so the planks lie across the run the way a real bridge's do. The
 * parapet is drawn in an *edge's* frame — along the north edge, `x` running
 * along it — which is what `placeOnEdge` in `resortLayout.ts` stands a rail by.
 */

import { PALETTE, type Ramp } from '../palette.ts';
import {
  BRIDGE_VOXELS,
  PAVING_VOXELS,
  TILE_VOXELS,
  type ModelLight,
  type VoxelBuilder,
} from '../voxelgen.ts';

/** Board pitch in voxels, the dark gap between two boards included; the jetty's. */
const BOARD_WIDTH = 4;

/**
 * How deep a parapet's trestle is, out of the tile, in voxels.
 *
 * Two, so a post has a stringer under it to stand on and the trestle reads as a
 * leg rather than as a wire — and so the railing model is two voxels deep, which
 * is what every edge rail on the plot is.
 */
export const FLANK = 2;

/** Voxels the handrail stands above the planking. Four is a metre, as `railing.ts`. */
const RAIL_HEIGHT = 4;

/**
 * Voxels from one parapet post to the next.
 *
 * Five, which puts a post at each end of a tile and two between them. The rail
 * itself is one rectangle the whole length of the run whatever the pitch, so
 * what the posts cost is a handful of quads each and nothing else.
 */
const POST_PITCH = 5;

/**
 * The inset of a deck's piles from the tile's edge, and how thick each is.
 *
 * Far enough in that a pile never shares a face plane with the trestle a
 * railing stands along the same edge, and symmetric under a quarter turn, so a
 * deck turned either way along its crossing stands on the same four legs.
 */
const PILE_INSET = 3;
const PILE = 2;

/** The lantern's glass: the warm amber the spa's and the entrance's lanterns burn. */
export const LANTERN = PALETTE.amber.light;

/** How far above its planking a parapet's top rail stands. */
export const PARAPET_RAIL = RAIL_HEIGHT;

export interface SpanDeckOptions {
  /** The layer the planks are laid in; the beam is the layer below. */
  readonly y: number;
  /** First and last row of the run, along the crossing. */
  readonly z0: number;
  readonly z1: number;
  readonly timber?: Ramp;
}

/**
 * One run of decking, the full width of a tile: a beam and the planks on it.
 *
 * Nothing under it and nothing along its flanks. What holds it up is
 * {@link spanPiles}, and what stops anyone walking off it is a railing, stood by
 * the layout only where there is something to walk off.
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
}

export interface SpanPilesOptions {
  /** The layer the beam they carry is in; the piles stop one below it. */
  readonly beam: number;
  /** Which of the two rows of piles to drive, by the row they start on. */
  readonly rows: readonly number[];
  readonly timber?: Ramp;
}

/**
 * Piles from the bed of the water up to a beam, two across the tile per row.
 *
 * Inset from every edge, so the middle of a platform has something to stand on
 * without a single one of them lining up with a trestle. See {@link PILE_INSET}.
 */
export function spanPiles(b: VoxelBuilder, o: SpanPilesOptions): void {
  const timber = o.timber ?? PALETTE.teak;
  const far = TILE_VOXELS - PILE_INSET - PILE;
  for (const z of o.rows) {
    for (const x of [PILE_INSET, far]) {
      b.box(x, x + PILE - 1, 0, o.beam - 1, z, z + PILE - 1, timber.deep);
    }
  }
}

/** The two rows a whole tile of deck drives its piles on. */
export const PILE_ROWS: readonly number[] = [PILE_INSET, TILE_VOXELS - PILE_INSET - PILE];

export interface SpanParapetOptions {
  /** The layer of planking this stretch guards, at each voxel along the edge. */
  readonly planksAt: (x: number) => number;
  readonly timber?: Ramp;
}

/**
 * A parapet along the north edge of a tile: the trestle down to the bed of the
 * water, a kick rail on the planking's edge, posts, and a top rail a metre up.
 *
 * The trestle is part of the parapet rather than of the deck, and it has to be.
 * `voxelgen` shifts every model onto its own origin, so a railing that painted
 * nothing at the water would drop onto it and take its rail down a metre. With
 * the trestle it stands from the bed like the deck beside it does — and the two
 * never paint the same voxel: the trestle stops under the beam, and the rails
 * start above the planks.
 *
 * The posts are pitched off the edge's own ends, which lands them in the same
 * places whichever way along it a ramp's parapet climbs.
 */
export function spanParapet(b: VoxelBuilder, o: SpanParapetOptions): void {
  const timber = o.timber ?? PALETTE.teak;
  for (let x = 0; x < TILE_VOXELS; x++) {
    const planks = o.planksAt(x);
    const rail = planks + PARAPET_RAIL;
    b.box(x, x, 0, planks - 2, 0, FLANK - 1, timber.deep);
    b.box(x, x, planks + 1, planks + 1, 0, 0, timber.shade);
    if (x % POST_PITCH === 0) b.box(x, x, planks + 2, rail - 1, 0, 0, timber.shade);
    b.box(x, x, rail, rail, 0, 0, timber.light);
  }
}

/** Where a lantern stands on a parapet: its first voxel along the edge, and the top rail under it. */
export interface LanternSpot {
  readonly x: number;
  readonly rail: number;
}

/** A lantern standing on a parapet's top rail, two voxels square. */
export function spanLantern(b: VoxelBuilder, at: LanternSpot): void {
  const { metal } = PALETTE;
  const x1 = at.x + 1;
  b.box(at.x, x1, at.rail + 1, at.rail + 1, 0, FLANK - 1, metal.deep);
  b.box(at.x, x1, at.rail + 2, at.rail + 3, 0, FLANK - 1, LANTERN);
  b.box(at.x, x1, at.rail + 4, at.rail + 4, 0, FLANK - 1, metal.deep);
}

/**
 * The light a {@link spanLantern} casts, declared off the same spot so the lamp
 * cannot end up anywhere but inside its own glass.
 */
export function lanternLight(at: LanternSpot): ModelLight {
  return {
    x: at.x + 1,
    y: at.rail + 3,
    z: FLANK / 2,
    color: LANTERN,
    // Dimmer and shorter than a street lamp: a crossing has one on every rail,
    // and what each has to light is the planking a few metres either side of it.
    intensity: 30,
    distance: 26,
  };
}

/**
 * Treads in a ramp's climb, and so the rise of each one.
 *
 * The lowest plank sits one voxel above the paving and the highest is the
 * deck's, which is `BRIDGE_VOXELS - PAVING_VOXELS` voxels of rise over as many
 * treads — four, which divides the tile into four treads of four voxels. Here
 * rather than in `bridge-ramp.ts` because the ramp's two railings step with
 * exactly these treads.
 */
export const RAMP_TREADS = BRIDGE_VOXELS - PAVING_VOXELS;

/** How deep one tread is, so the climb fills the tile exactly. */
export const RAMP_GOING = TILE_VOXELS / RAMP_TREADS;

/**
 * The layer a ramp's planks are in, `along` voxels up the climb from its bank.
 *
 * Tread by tread: the planks of tread `step` sit in the layer below that tread's
 * walking surface, so the last one lands in the layer `bridge.ts` lays its deck
 * in.
 */
export function rampPlanksAt(along: number): number {
  return PAVING_VOXELS + Math.floor(along / RAMP_GOING);
}
