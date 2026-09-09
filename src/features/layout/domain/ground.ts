/**
 * What the ground under a tile is made of.
 *
 * Two modules already answer half of this and neither can answer it alone.
 * `shoreline.ts` knows where the sea and the sand are but nothing about height;
 * `elevation.ts` knows how high a tile stands but nothing about what it is. A
 * dune is exactly the tile both of them have an opinion about — sand, four
 * metres up — so the answer lives here, in the one module that reads both.
 *
 * The rule is short: the sea wins, then a terrace's own surface, then the sand
 * band at sea level, then grass. A terrace of sand is what carries the beach up
 * the hill behind it, and it is the *only* way sand gets above sea level: the
 * flat band in front of the water is level 0 by an invariant `elevation.ts`
 * enforces, so the two never disagree about a tile.
 *
 * Three things read it, and they are the three things that treat sand as
 * different from grass:
 *
 * - the paving, because a path on sand is decking rather than flagstones;
 * - the dressing, because a lamp post is a street fitting and a hedge is a
 *   garden one, and neither belongs on a beach;
 * - the terrain surfaces, because a bench of sand is drawn in sand.
 *
 * Everything else about a tile — whether something can stand on it, whether a
 * spur can route through it — is the same on either, which is why this is a
 * question about *material* and not about buildability.
 */

import { terraceAt, type Elevation, type TerraceSurface } from './elevation';
import { terrainAt, type Shore } from './shoreline';

/** What one tile of the plot is made of, sea included. */
export type Ground = TerraceSurface | 'water';

/**
 * The ground under one tile.
 *
 * The elevation may be null — a flat plot — and so may the shore, and the answer
 * for a plot with neither is grass everywhere, which is what a plot with no
 * features is.
 */
export function groundAt(
  shore: Shore | null,
  elevation: Elevation | null,
  tileX: number,
  tileZ: number,
): Ground {
  const terrain = terrainAt(shore, tileX, tileZ);
  if (terrain === 'water') return 'water';
  const terrace = terraceAt(elevation, tileX, tileZ);
  if (terrace) return terrace.surface ?? 'grass';
  return terrain === 'beach' ? 'sand' : 'grass';
}

/**
 * Whether a tile is sand, which is what makes a path over it a boardwalk.
 *
 * The beach in front of the water and the dune behind it are the same answer
 * here on purpose: the sidewalk along the top of a dune is decking for the same
 * reason the pier out to the water is.
 */
export function isSandGround(
  shore: Shore | null,
  elevation: Elevation | null,
  tileX: number,
  tileZ: number,
): boolean {
  return groundAt(shore, elevation, tileX, tileZ) === 'sand';
}
