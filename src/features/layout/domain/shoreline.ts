/**
 * Where the resort stops being land.
 *
 * The plot keeps its rectangle; what changes is that its southern end is sea,
 * with a band of sand between the water and the buildable ground. The south
 * edge rather than a corner, so the beach is a strip the full width of the
 * resort — one shoreline every district can reach, instead of a wedge that only
 * the two districts nearest one corner ever see. The isometric camera opens
 * standing over the south-east corner, which puts that strip across the front of
 * the frame with the resort behind it.
 *
 * The shore is described per tile **column**, not as a line: `waterStartZ(x)` is
 * the first water tile in column `x`, a straight edge with a seeded wobble on
 * it. Everything else — what a tile is, how deep into the sand it sits, where
 * the sea surface has to be drawn — is derived from that one number. A column is
 * the natural unit because both users of this module walk columns: the layout
 * classifies tiles, and the renderer emits one span of sea and one of sand per
 * column. A description in columns also means the staircase the tile grid makes
 * of a wandering coast is the *same* staircase in both, so the sand and the
 * water meet exactly rather than nearly.
 *
 * Nothing here is bounded by the plot. The coast runs on past it in both
 * directions, which is what the renderer needs to draw a sea that reaches the
 * horizon; only the callers that place things clamp to the plot.
 */

/** How the water cuts into the plot. Optional on a plan: no spec, no sea. */
export interface ShoreSpec {
  /** How far the water reaches in from the plot's south edge, in tiles. */
  readonly inset: number;
  /** Depth of the sand band, in tiles. */
  readonly beach: number;
  /** How far the shoreline wanders off a straight edge, in tiles. */
  readonly wave: number;
  /** Any integer; the same one gives the same coastline. */
  readonly seed: number;
}

/** A shore spec anchored on a plot of a particular size. */
export interface Shore {
  readonly spec: ShoreSpec;
  readonly tilesX: number;
  readonly tilesZ: number;
}

/** What one tile of the plot is made of. */
export type Terrain = 'land' | 'beach' | 'water';

/** The plot dimensions and shore spec a plan carries. */
export interface ShorePlan {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly shore?: ShoreSpec;
}

/** Anchors a plan's shore on its plot, or null when the plan has no sea. */
export function shoreFor(plan: ShorePlan): Shore | null {
  if (!plan.shore) return null;
  if (plan.shore.inset <= 0 || plan.shore.beach <= 0) return null;
  return { spec: plan.shore, tilesX: plan.tilesX, tilesZ: plan.tilesZ };
}

/**
 * How much the shoreline wanders at column `x`.
 *
 * Two sines rather than one, at wavelengths that do not divide each other, so
 * the coast does not repeat within a plot; the phases come off the seed, so a
 * resort's coastline is as reproducible as the rest of it. Deliberately not a
 * random walk: a coast has to be a function of `x` alone, because the renderer
 * asks about columns the layout never sees.
 */
function waveAt(spec: ShoreSpec, tileX: number): number {
  if (spec.wave <= 0) return 0;
  const slow = Math.sin(tileX * 0.041 + phaseOf(spec.seed, 1));
  const quick = Math.sin(tileX * 0.17 + phaseOf(spec.seed, 2));
  return (slow * 0.62 + quick * 0.38) * spec.wave;
}

/**
 * One of the wave's phases, scattered rather than scaled off the seed.
 *
 * Seed 7 and seed 8 are neighbours as numbers and must not be neighbours as
 * coastlines: a phase taken as a fraction of the seed put the two within a
 * hundredth of a radian of each other, and both rounded to the same tiles.
 */
function phaseOf(seed: number, salt: number): number {
  const mixed = Math.sin(Math.trunc(seed) * 127.1 + salt * 311.7) * 43758.5453;
  return (mixed - Math.floor(mixed)) * Math.PI * 2;
}

/**
 * The first water tile in a column, measured in from the plot's south edge.
 *
 * May fall outside the plot in either direction — a column the coast bulges
 * south on can start its water past the last row. That is meaningful rather than
 * a mistake: the renderer draws the sea out to the horizon, where the plot has
 * long since ended.
 */
export function waterStartZ(shore: Shore, tileX: number): number {
  return Math.round(shore.tilesZ - 1 - shore.spec.inset + waveAt(shore.spec, tileX));
}

/** What a tile is made of. Everything is land when the plan has no shore. */
export function terrainAt(shore: Shore | null, tileX: number, tileZ: number): Terrain {
  if (!shore) return 'land';
  const water = waterStartZ(shore, tileX);
  if (tileZ >= water) return 'water';
  return tileZ >= water - shore.spec.beach ? 'beach' : 'land';
}

/**
 * How far into the sand a tile sits: 0 at the water's edge, up to `beach - 1`
 * against the grass. -1 for anything that is not sand.
 *
 * This is the coordinate the beach is laid out along, and it is measured off the
 * water rather than off the grass on purpose: the sand band is a fixed depth, so
 * both edges move together, but only the seaward one is a thing you can see.
 */
export function beachDepthAt(shore: Shore | null, tileX: number, tileZ: number): number {
  if (!shore || terrainAt(shore, tileX, tileZ) !== 'beach') return -1;
  return waterStartZ(shore, tileX) - 1 - tileZ;
}

/** Whether a tile is sea, and so neither buildable nor pavable. */
export function isWater(shore: Shore | null, tileX: number, tileZ: number): boolean {
  return terrainAt(shore, tileX, tileZ) === 'water';
}

/** Whether a tile is sand, which is what makes a path over it a boardwalk. */
export function isBeach(shore: Shore | null, tileX: number, tileZ: number): boolean {
  return terrainAt(shore, tileX, tileZ) === 'beach';
}

/** Every tile of the plot the sea covers. */
export function waterTilesOf(shore: Shore | null): { x: number; z: number }[] {
  if (!shore) return [];
  const tiles: { x: number; z: number }[] = [];
  for (let x = 0; x < shore.tilesX; x++) {
    for (let z = Math.max(0, waterStartZ(shore, x)); z < shore.tilesZ; z++) tiles.push({ x, z });
  }
  return tiles;
}

/**
 * Every tile of the plot the sand covers, walked landward first.
 *
 * Row by row from the grass down to the water, which is the order the beach is
 * filled in: the buildings get their pick of the sand before the loungers start
 * filling it in. See `resortGenerator.ts`.
 */
export function beachTilesOf(shore: Shore | null): { x: number; z: number }[] {
  if (!shore) return [];
  const tiles: { x: number; z: number }[] = [];
  for (let z = 0; z < shore.tilesZ; z++) {
    for (let x = 0; x < shore.tilesX; x++) {
      if (terrainAt(shore, x, z) === 'beach') tiles.push({ x, z });
    }
  }
  return tiles;
}
