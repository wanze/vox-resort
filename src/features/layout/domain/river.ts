/**
 * A river across a bare plot: the one piece of terrain the plot is *handed*
 * rather than grown.
 *
 * Everything else about the ground is a line strung across the plot and
 * evaluated per column — see `wander.ts` for why that is the right shape for a
 * coast and for a terrace step. A river is the opposite shape and that is the
 * whole reason it needs a module: it runs *down* the plot rather than across it,
 * it is a walk rather than a function, and where it goes next depends on where
 * it has been. A line in `x` cannot say "and then it turns left".
 *
 * So the river is generated once, as a list of tiles, and carried on the plan as
 * terrain edits — see `terrain.ts`. That is also what makes it reproducible from
 * a seed like the rest of the plot: the same four numbers give the same river.
 *
 * **It flows to the sea, and it takes the hill as it finds it.** The walk starts
 * at the back of the plot and steps south a row at a time until it reaches
 * water, and each tile it covers is flooded *at whatever level that tile already
 * stands*. Nothing is dug and nothing is levelled: a river crossing four
 * terraces comes out as four flat reaches with a fall between each, which is
 * what a river down a terraced hillside looks like. It also means the river
 * never breaks the one invariant the ground has — neighbours within a level of
 * each other — because it never moves a level at all.
 *
 * **It is banked in sand.** One tile either side, where that tile stands at the
 * river's own level and is not itself water. Sand rather than nothing, because a
 * strip of water through a lawn reads as a canal and a strip of water through
 * sand reads as a river; and only at the same level, so the bank never climbs
 * the riser of a terrace the river has just fallen down.
 *
 * **A plot with no sea gets no river.** There would be nowhere for it to go, and
 * a river ending in the middle of a lawn is a mistake rather than a feature.
 */

import { createRandom } from './random';
import type { Terrain, TerrainEdit } from './terrain';
import { createTerrain } from './terrain';
import type { Elevation } from './elevation';
import type { Shore } from './shoreline';

/**
 * How wide the channel is, in tiles.
 *
 * Two, which at sixteen voxels to a tile is a river you would need a bridge to
 * cross and not a gorge. One tile read as a ditch and three swallowed a whole
 * district on a small plot.
 */
const RIVER_WIDTH = 2;

/**
 * How often the channel steps sideways, and how far, per row it comes down.
 *
 * A river that wandered every row came out as a staircase — the diagonal a tile
 * grid makes of a 45-degree line — so it holds its column for a few rows at a
 * time. The result is a run of reaches with a kink between them, which is what a
 * river on a map looks like at this scale.
 */
const BEND_CHANCE = 0.32;

/** How far in from the plot's sides the mouth and the source are kept. */
const BANK_MARGIN = 3;

export interface RiverParts {
  readonly shore: Shore | null;
  readonly elevation: Elevation | null;
  readonly tilesX: number;
  readonly tilesZ: number;
  /** Any integer; the same one gives the same river. */
  readonly seed: number;
}

/**
 * The salt the river's own wander is drawn from.
 *
 * Its own generator rather than a shared one, for the reason the crowd's and the
 * bay's seeds are their own: a plot that grew a taller hill must not get a
 * different river because the hill drew numbers first.
 */
const RIVER_SALT = 0x1f7;

/** Every tile of the channel, walked from the source down to the sea. */
function channelOf(parts: RiverParts, terrain: Terrain): { x: number; z: number }[] {
  const random = createRandom(parts.seed + RIVER_SALT);
  const span = parts.tilesX - 2 * BANK_MARGIN - RIVER_WIDTH;
  if (span <= 0) return [];
  let west = BANK_MARGIN + Math.floor(random() * span);
  const tiles: { x: number; z: number }[] = [];

  for (let tileZ = 0; tileZ < parts.tilesZ; tileZ++) {
    let reachedWater = false;
    for (let offset = 0; offset < RIVER_WIDTH; offset++) {
      const tileX = west + offset;
      // The mouth: the channel stops where it meets the bay rather than being
      // painted over it, because the sea is nobody's to change. See `terrain.ts`.
      if (terrain.isSea(tileX, tileZ)) {
        reachedWater = true;
        continue;
      }
      tiles.push({ x: tileX, z: tileZ });
    }
    if (reachedWater) break;
    if (random() < BEND_CHANCE) {
      const step = random() < 0.5 ? -1 : 1;
      west = Math.min(parts.tilesX - BANK_MARGIN - RIVER_WIDTH, Math.max(BANK_MARGIN, west + step));
    }
  }
  return tiles;
}

/**
 * The edits a river on this plot makes: the channel, and the sand it is banked
 * in.
 *
 * Ordered channel-first, so a bank tile can never be written over water: the
 * bank pass asks the terrain whether its tile is already flooded, and the
 * terrain it asks has the whole channel in it by then.
 */
export function riverEditsFor(parts: RiverParts): readonly TerrainEdit[] {
  if (!parts.shore) return [];
  // A terrain of its own to plan against: the river has to read the levels the
  // hill actually stands at, and has to see its own channel while it banks it.
  const terrain = createTerrain({
    shore: parts.shore,
    elevation: parts.elevation,
    tilesX: parts.tilesX,
    tilesZ: parts.tilesZ,
  });

  const channel = channelOf(parts, terrain);
  for (const tile of channel) {
    terrain.set(tile.x, tile.z, { level: terrain.levelOf(tile.x, tile.z), surface: 'water' });
  }

  for (const tile of channel) {
    const level = terrain.levelOf(tile.x, tile.z);
    for (const dx of [-1, 1]) {
      const bank = { x: tile.x + dx, z: tile.z };
      if (!terrain.holds(bank.x, bank.z)) continue;
      const standing = terrain.tileAt(bank.x, bank.z);
      // Only ground at the river's own level, and only ground that is not
      // already water: a bank up a terrace riser is not a bank, and the far side
      // of a two-tile channel is the other half of the river.
      if (standing.surface === 'water' || standing.level !== level) continue;
      terrain.set(bank.x, bank.z, { level: standing.level, surface: 'sand' });
    }
  }

  return terrain.edits;
}
