/**
 * Which paved tiles are stairs, and which way each flight faces.
 *
 * `layoutResort` already chooses a tile's paving from the ground under it —
 * flagstones on grass, decking on sand. A staircase is the third case of exactly
 * that rule and nothing more: a paved tile whose paved neighbour stands one
 * terrace higher is not a flat slab, it is the flight up to it.
 *
 * **The flight goes on the lower tile.** There is no tile between two adjacent
 * tiles, so the step has to be hosted by one of them, and the lower one is the
 * only choice that works: it starts at the paving it continues and ends flush
 * with the paving above, which is precisely how `stairs.ts` is authored. The
 * upper tile stays an ordinary slab.
 *
 * **Only towards paved ground.** A path that runs along the foot of a step with
 * nothing but grass above it needs no stairs — there is nowhere to climb to, and
 * a flight ending in a lawn reads as a mistake rather than as a shortcut. So the
 * higher neighbour has to be paved too, which it is exactly when a street or a
 * spur crosses the step.
 *
 * **One level, always.** `elevation.ts` holds a plan to steps of a single level,
 * so a flight is always `LEVEL_VOXELS` and one model covers every step on the
 * plot. Nothing here has to cope with a cliff.
 *
 * The awkward case is a path that turns *on* a step — an L-bend whose corner has
 * higher paved ground on two perpendicular sides. One tile cannot climb in two
 * directions, so the first by compass order wins. That is a deliberate fudge
 * rather than a refusal: the routing picks those corners without knowing where
 * the steps are, and a corner is not a reason to refuse a whole resort.
 */

import type { LevelProvider } from './elevation';
import type { Tile } from './resortLayout';
import type { Rotation } from './rotation';

/**
 * The four ways a flight can climb, and the turn that points it there.
 *
 * Unturned, `stairs.ts` climbs towards the north, and a turn of one swings that
 * face round to the west — see `rotation.ts`. The order is the order an
 * ambiguous corner is resolved in, north first, so which way such a flight faces
 * is a fact about this list rather than about the order tiles were paved in.
 */
const CLIMBS: readonly { readonly dx: number; readonly dz: number; readonly rotation: Rotation }[] =
  [
    { dx: 0, dz: -1, rotation: 0 },
    { dx: -1, dz: 0, rotation: 1 },
    { dx: 0, dz: 1, rotation: 2 },
    { dx: 1, dz: 0, rotation: 3 },
  ];

/** A paved tile that turned out to be a flight of stairs, and the way it faces. */
export interface StairTile {
  readonly tile: Tile;
  /** Quarter turns that point the climb at the higher ground. */
  readonly rotation: Rotation;
}

/**
 * The flights among a set of paved tiles, in the order the tiles came in.
 *
 * Every tile is classified against the same level field and the same set of
 * paved tiles, so the answer does not depend on where the walk started: a step
 * either has paving on both sides of it or it does not.
 */
export function stairTilesFor(paved: readonly Tile[], levelOf: LevelProvider): StairTile[] {
  const pavedKeys = new Set(paved.map((tile) => `${tile.x},${tile.z}`));
  const stairs: StairTile[] = [];
  for (const tile of paved) {
    const level = levelOf(tile.x, tile.z);
    const climb = CLIMBS.find(
      ({ dx, dz }) =>
        pavedKeys.has(`${tile.x + dx},${tile.z + dz}`) &&
        levelOf(tile.x + dx, tile.z + dz) === level + 1,
    );
    if (climb) stairs.push({ tile, rotation: climb.rotation });
  }
  return stairs;
}
