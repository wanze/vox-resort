// Tiles are flooded at the level they already stand, so the river never breaks the
// neighbours-within-a-level invariant.

import { createRandom } from './random';
import type { Terrain, TerrainEdit } from './terrain';
import { createTerrain } from './terrain';
import type { Elevation } from './elevation';
import type { Shore } from './shoreline';

// One tile read as a ditch, three swallowed a district on a small plot.
const RIVER_WIDTH = 2;

// Holds its column for a few rows: wandering every row came out as a staircase.
const BEND_CHANCE = 0.32;

const BANK_MARGIN = 3;

export interface RiverParts {
  readonly shore: Shore | null;
  readonly elevation: Elevation | null;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly seed: number;
}

// Its own generator, so a plot that grew a taller hill does not get a different river.
const RIVER_SALT = 0x1f7;

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
      // The sea is never edited, so the channel stops where it meets it.
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

// Channel first, so the bank pass sees the whole channel and never writes sand over water.
export function riverEditsFor(parts: RiverParts): readonly TerrainEdit[] {
  if (!parts.shore) return [];
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
      // A bank up a terrace riser is not a bank, and a water tile is the other half of the channel.
      if (standing.surface === 'water' || standing.level !== level) continue;
      terrain.set(bank.x, bank.z, { level: standing.level, surface: 'sand' });
    }
  }

  return terrain.edits;
}
