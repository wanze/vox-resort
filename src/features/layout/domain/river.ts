// Runs along the coast, not down to it: a river from the sea up the hill reads as flowing uphill.
// Tiles are flooded at the level they already stand, so the river never breaks the
// neighbours-within-a-level invariant.

import { createRandom } from './random';
import type { Terrain, TerrainEdit } from './terrain';
import { createTerrain } from './terrain';
import type { Elevation } from './elevation';
import { waterEdgeZ, waterStartZ, type Shore } from './shoreline';
import { meanderAt } from './wander';

// One tile read as a ditch, three swallowed a district on a small plot.
const RIVER_WIDTH = 2;

const MEANDER = 2;

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

// The hill's last step comes back down to the flat, so behind it is the ground a river can lie on.
function inlandInset(shore: Shore, elevation: Elevation | null): number {
  const back = elevation?.spec.terraces.at(-1);
  return back ? back.inset + back.wave : shore.spec.beach;
}

// In rows off the water. The bounds carry a row of slack each way for the rounding of the
// coast and of the meander.
function lineOf(parts: RiverParts, shore: Shore): number | null {
  let nearest = Number.POSITIVE_INFINITY;
  for (let tileX = 0; tileX < parts.tilesX; tileX++) {
    nearest = Math.min(nearest, waterStartZ(shore, tileX));
  }
  const low = inlandInset(shore, parts.elevation) + BANK_MARGIN + MEANDER + 2;
  const high = nearest - BANK_MARGIN - MEANDER - RIVER_WIDTH;
  if (high < low) return null;
  const random = createRandom(parts.seed + RIVER_SALT);
  return low + Math.round((high - low) * (0.3 + random() * 0.4));
}

// Out through the apron as well, so the river comes from somewhere rather than out of the plot's edge.
function channelOf(parts: RiverParts, shore: Shore, terrain: Terrain): { x: number; z: number }[] {
  const line = lineOf(parts, shore);
  if (line === null) return [];
  const tiles: { x: number; z: number }[] = [];
  let previous: { low: number; high: number } | null = null;
  for (let tileX = -parts.tilesX; tileX < 2 * parts.tilesX; tileX++) {
    const wander = meanderAt(parts.seed, RIVER_SALT, tileX, MEANDER);
    const seaward = Math.round(waterEdgeZ(shore, tileX) - line - wander);
    let low = seaward - RIVER_WIDTH + 1;
    let high = seaward;
    // A column two rows off the last would leave the channel joined only at a corner.
    if (previous) {
      low = Math.min(low, previous.high);
      high = Math.max(high, previous.low);
    }
    previous = { low: seaward - RIVER_WIDTH + 1, high: seaward };
    for (let tileZ = low; tileZ <= high; tileZ++) {
      if (!terrain.holds(tileX, tileZ) || terrain.isSea(tileX, tileZ)) continue;
      tiles.push({ x: tileX, z: tileZ });
    }
  }
  return tiles;
}

// Grass right up to the water: a sand bank read as a beach along an inland river.
export function riverEditsFor(parts: RiverParts): readonly TerrainEdit[] {
  if (!parts.shore) return [];
  const terrain = createTerrain({
    shore: parts.shore,
    elevation: parts.elevation,
    tilesX: parts.tilesX,
    tilesZ: parts.tilesZ,
  });
  for (const tile of channelOf(parts, parts.shore, terrain)) {
    terrain.set(tile.x, tile.z, { level: terrain.levelOf(tile.x, tile.z), surface: 'water' });
  }
  return terrain.edits;
}
