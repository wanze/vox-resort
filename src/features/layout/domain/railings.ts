/**
 * Which paved tiles get a handrail, and along which of their edges.
 *
 * The last of the rules that read the ground rather than the plan. `ground.ts`
 * decides what a tile is paved *with*, `stairs.ts` decides where that paving
 * climbs, and this decides where it needs holding on to. All three are derived,
 * so a path drawn anywhere on the plot comes out with the same railings a
 * generated one does, and nothing has to be authored twice.
 *
 * Two cases, and they are the two the eye expects:
 *
 * - **A drop beside a path.** A paved tile whose neighbour stands *lower* and is
 *   not paved is a tile you could walk off the side of, so it gets a rail along
 *   that edge — the balustrade along the top of a terrace, and along the walks
 *   that follow the hill's benches. It takes one railing per edge, so the corner
 *   of a bench comes out with two. **Open water counts as a drop**, whatever it
 *   measures: a pier stands at sea level and the sea beside it stands at sea
 *   level, so nothing about the heights says you would fall in. That is what
 *   rails a jetty down both flanks and across its head without the model knowing
 *   which tile of the pier it is — see `jetty.ts`.
 * - **The flanks of a flight.** A staircase is guarded up both sides whether or
 *   not the ground beside it drops, which is what a staircase looks like
 *   everywhere it has ever been built. One model carries both flanks, because
 *   the two are mirrors of each other and no quarter turn maps one onto the
 *   other — see `stair-railing.ts` — and it takes the flight's own rotation.
 *
 * **A raised span is railed by its own models, and at its own height.** A rail
 * claims no ground of its own, it stands on the tile it guards *at that tile's
 * height* — right for a jetty, whose deck is at the sea's own level, and a rail
 * in the river for a bridge, whose deck is a metre up. So a tile of a crossing
 * never takes the ordinary rail. It takes a bridge's parapet instead, which is
 * drawn standing on a trestle from the water up to the planking, along every
 * edge with nothing paved beyond it:
 *
 * - **The deck** is railed edge by edge, exactly as a pier is. That is what lets
 *   two crossings meet: the junction has span on all four sides and so no
 *   parapet on any of them, and a platform widened out of a crossing is railed
 *   round its rim and nowhere across its middle.
 * - **The ramp** is railed up whichever of its two flanks is open, by the left
 *   or the right model — a flank is the mirror of the other, see
 *   `voxel-gen/models/bridge-ramp-railing-left.ts` — and across its head if a
 *   crossing stops one tile out. Its bank end is paved by definition, so it is
 *   never railed.
 *
 * See `spans.ts` for which of the two a tile is.
 *
 * **Paving is always the way through.** A neighbour that is paved never gets a
 * rail between it and here, on either rule. That is what keeps a flight open at
 * the top and the bottom, what stops a rail being drawn down the middle of a
 * two-tile street where both halves climb, and what lets a walk turn a corner
 * without being fenced off from itself.
 *
 * A rail claims no ground: it stands on the tile it guards, at that tile's own
 * height, alongside whatever paving is already there. That is why the layout
 * keeps them in a list of their own — see `ResortLayout.rails`.
 */

import { CLIMBS, climbAt, type PavedProvider } from './stairs';
import { spanAt, type SpanProvider } from './spans';
import type { LevelProvider } from './elevation';
import type { Tile } from './resortLayout';
import { normalizeRotation, type Rotation } from './rotation';

/** Whether a tile is open water, asked of the ground around the tile being judged. */
export interface WaterProvider {
  (tileX: number, tileZ: number): boolean;
}

/** A plot with no sea on it, which is every flat authored plan. */
const NO_WATER: WaterProvider = () => false;

/** A plot with nothing raised over water on it, which is every plan with no river. */
const NO_SPAN: SpanProvider = () => false;

/**
 * What a rail is: the balustrade of a flight, a rail along one edge — lit, on a
 * tile that is itself out over the water — a parapet
 * along one edge of a bridge's deck, or the parapet up one flank of its ramp.
 */
export type RailKind = 'flight' | 'edge' | 'pier' | 'span' | 'ramp-left' | 'ramp-right';

/** A rail the ground asked for: where it stands, which way it faces, and which kind. */
export interface RailTile {
  readonly tile: Tile;
  /**
   * Quarter turns that point the rail at what it guards: the edge it runs
   * along, or — for a flight — the way that flight climbs. A ramp's parapet is
   * an edge rail too, and is turned to the flank it runs up.
   */
  readonly rotation: Rotation;
  readonly kind: RailKind;
}

/** The two turns across a climb: the flanks of a flight that climbs this way. */
function flanksOf(climb: Rotation): Rotation[] {
  return [normalizeRotation(climb + 1), normalizeRotation(climb + 3)];
}

/** The way a rotation points, as a step on the tile grid. */
function stepOf(rotation: Rotation): { readonly dx: number; readonly dz: number } {
  const climb = CLIMBS.find((candidate) => candidate.rotation === rotation)!;
  return { dx: climb.dx, dz: climb.dz };
}

/**
 * The rails one paved tile asks for, or none at all.
 *
 * The whole rule, and the only place it lives — the counterpart of `climbAt`,
 * which it asks first: a tile that is a flight is guarded as a flight, and
 * everything else is guarded by what its neighbours are standing on. The tile
 * itself is not asked whether it is paved, because every caller only ever asks
 * about a tile it is paving.
 */
export function railsAt(
  tile: Tile,
  isPaved: PavedProvider,
  levelOf: LevelProvider,
  isWater: WaterProvider = NO_WATER,
  isSpan: SpanProvider = NO_SPAN,
): RailTile[] {
  // A tile of a raised crossing takes a bridge's parapets; see the note at the top.
  if (isSpan(tile.x, tile.z)) return spanRailsAt(tile, isPaved, isSpan);
  const climb = climbAt(tile, isPaved, levelOf);
  if (climb !== null) {
    // Both flanks, or neither. One model carries the pair, so a flight with
    // paving up one side of it — the middle of a staircase two or three tiles
    // wide — would be given a balustrade straight down the treads. A wide
    // staircase is left open instead, which is what a wide staircase is.
    const alone = flanksOf(climb).every((flank) => {
      const { dx, dz } = stepOf(flank);
      return !isPaved(tile.x + dx, tile.z + dz);
    });
    return alone ? [{ tile, rotation: climb, kind: 'flight' }] : [];
  }

  const level = levelOf(tile.x, tile.z);
  // A tile over the water is a pier, and a pier's rail carries a lantern: it is
  // walked out into the dark, where a terrace walk has street lamps along it.
  const kind: RailKind = isWater(tile.x, tile.z) ? 'pier' : 'edge';
  return CLIMBS.filter(({ dx, dz }) => {
    const beside = { x: tile.x + dx, z: tile.z + dz };
    if (isPaved(beside.x, beside.z)) return false;
    return levelOf(beside.x, beside.z) < level || isWater(beside.x, beside.z);
  }).map(({ rotation }) => ({ tile, rotation, kind }));
}

/**
 * The parapets one tile of a raised crossing asks for.
 *
 * Every open edge of a deck, and every open edge of a ramp but its bank end —
 * which is never open, since it is what makes the tile a ramp. A ramp's flanks
 * step with its treads, so which model a flank takes depends on which side of
 * the climb it is on; its head is level with the deck beyond it, and takes the
 * deck's parapet.
 */
function spanRailsAt(tile: Tile, isPaved: PavedProvider, isSpan: SpanProvider): RailTile[] {
  const span = spanAt(tile, isPaved, isSpan);
  const kindOf = (edge: Rotation): RailKind => {
    if (span.kind === 'deck') return 'span';
    // The bank is the ramp's own turn, so the flank a quarter turn on from it is
    // on the right as you look up the climb from the bank, and three quarters on
    // is on the left. See the two models for why that is the way round.
    const offset = normalizeRotation(edge - span.rotation);
    return offset === 1 ? 'ramp-right' : offset === 3 ? 'ramp-left' : 'span';
  };
  return CLIMBS.filter(({ dx, dz }) => !isPaved(tile.x + dx, tile.z + dz)).map(({ rotation }) => ({
    tile,
    rotation,
    kind: kindOf(rotation),
  }));
}

/**
 * Every rail a set of paved tiles asks for, in the order the tiles came in.
 *
 * Classified against the same level field and the same set of paved tiles as the
 * flights are, so the answer does not depend on where the walk started: an edge
 * either has a drop beyond it or it does not.
 */
export function railTilesFor(
  paved: readonly Tile[],
  levelOf: LevelProvider,
  isWater: WaterProvider = NO_WATER,
  isSpan: SpanProvider = NO_SPAN,
): RailTile[] {
  const pavedKeys = new Set(paved.map((tile) => `${tile.x},${tile.z}`));
  const isPaved: PavedProvider = (tileX, tileZ) => pavedKeys.has(`${tileX},${tileZ}`);
  return paved.flatMap((tile) => railsAt(tile, isPaved, levelOf, isWater, isSpan));
}
