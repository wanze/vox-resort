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
import type { LevelProvider } from './elevation';
import type { Tile } from './resortLayout';
import { normalizeRotation, type Rotation } from './rotation';

/** Whether a tile is open water, asked of the ground around the tile being judged. */
export interface WaterProvider {
  (tileX: number, tileZ: number): boolean;
}

/** A plot with no sea on it, which is every flat authored plan. */
const NO_WATER: WaterProvider = () => false;

/** What a rail is: the balustrade of a flight, or a rail along one edge. */
export type RailKind = 'flight' | 'edge';

/** A rail the ground asked for: where it stands, which way it faces, and which kind. */
export interface RailTile {
  readonly tile: Tile;
  /**
   * Quarter turns that point the rail at what it guards: the edge it runs
   * along, or — for a flight — the way that flight climbs.
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
): RailTile[] {
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
  return CLIMBS.filter(({ dx, dz }) => {
    const beside = { x: tile.x + dx, z: tile.z + dz };
    if (isPaved(beside.x, beside.z)) return false;
    return levelOf(beside.x, beside.z) < level || isWater(beside.x, beside.z);
  }).map(({ rotation }) => ({ tile, rotation, kind: 'edge' as const }));
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
): RailTile[] {
  const pavedKeys = new Set(paved.map((tile) => `${tile.x},${tile.z}`));
  const isPaved: PavedProvider = (tileX, tileZ) => pavedKeys.has(`${tileX},${tileZ}`);
  return paved.flatMap((tile) => railsAt(tile, isPaved, levelOf, isWater));
}
