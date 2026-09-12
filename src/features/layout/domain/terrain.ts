/**
 * The ground of the plot, tile by tile, as something that can be changed.
 *
 * `shoreline.ts` and `elevation.ts` describe the ground as a *function* — a
 * coastline and a set of step lines, evaluated per tile column — and that is
 * exactly right for ground that is grown rather than built. It is exactly wrong
 * for ground somebody is standing on with a spade: there is no inset that means
 * "this one tile is a lake", and a river running across four terraces is not a
 * line you can anchor to the water.
 *
 * So this is the third description of the ground, and it is the one everything
 * that *edits* the plot reads: a sparse layer of per-tile overrides in front of
 * the procedural answer. A tile nobody has touched answers exactly what
 * `groundAt` and `levelAt` answer for it — asserted in the tests, because the
 * whole design rests on it — and a tile that has been touched answers what it
 * was changed to.
 *
 * **A tile is two facts, and they are independent.** How high it stands, and
 * what it is made of. That is what makes a lake on a hilltop and an island in
 * the bay the same feature rather than two: an island is a sea tile whose level
 * went up, a lake is a grass tile whose surface went to water, and neither
 * needed a rule of its own.
 *
 * **Water is flush with the ground it is cut into.** A water tile's level is the
 * level of the bank around it, and the surface is drawn a hair above that bench
 * exactly as the sea is drawn a hair above sea level. It is tempting to dig it —
 * a river a level below its banks reads as a gorge — and it is the wrong trade:
 * paving stands at `levelOf`, so a sunken river would carry a sunken bridge, and
 * `climbAt` would read the bank as a flight of stairs down into the water. Flush
 * water costs a gorge and buys a bridge that lands level with the path either
 * side of it, which is what a bridge is. Somebody who wants banks raises the
 * land around the river, which is what the terrain tool is for.
 *
 * **The sea is not editable, and this is where that is knowable.** Every brush
 * asks {@link Terrain.isSea}, which is a question about the *base* rather than
 * about the tile as it stands: a sea tile raised into an island is land now, and
 * lowering it again has to give the bay back rather than leave a dry hole in it.
 * An override that comes back to exactly the base tile is dropped, so the plot
 * cannot accumulate edits that say nothing.
 *
 * Nothing here is bounded by the plot — the procedural coast and its terraces
 * run on past it, and the renderer draws them out to the horizon — but an
 * *override* is bounded by the **apron**: the plot, and a plot's width of ground
 * all round it. That is wider than the ground anything can be *built* on, and
 * deliberately: an island is ground rather than an object, and an island you can
 * only raise in the swim area is a sandbank at the end of the beach rather than
 * something out in the bay. Digging an apron's worth of open water either side
 * of the plot is what makes the bay somewhere to put one.
 *
 * It stays bounded all the same, because unbounded edits would cost the mesher a
 * map lookup on every tile out to the horizon and would let a stroke that runs
 * off the screen accumulate ground nobody can ever see again. See
 * {@link apronOf}.
 */

import type { Elevation, ElevationPlan, TerraceSpec } from './elevation';
import { elevationFor, maxLevelOf, stepStartZ } from './elevation';
import type { Ground } from './ground';
import type { Shore } from './shoreline';
import { shoreFor, waterStartZ } from './shoreline';

export type { Ground };

/**
 * How high the ground may be piled, in levels.
 *
 * Two levels above the tallest crest `resortGenerator.ts` grows, which is what
 * makes it a ceiling on the *tool* rather than a constraint on the terrain: a
 * generated hill never comes near it, and somebody sculpting by hand is stopped
 * before the plot turns into a tower. Sixty-four voxels is already four times
 * the height of a hotel.
 */
export const MAX_TERRAIN_LEVEL = 8;

/**
 * How far past the plot the ground may be dug, as a fraction of the plot's own
 * extent on that axis.
 *
 * One plot's width all round, so the diggable ground is nine times the plot's
 * area and the plot sits in the middle of it. Wide enough that an island raised
 * at the far edge of it reads as being out in the bay rather than off the end of
 * the beach, and narrow enough that the renderer's box — three times the resort's
 * extent either side, see `threeScene.ts` — still draws every tile of it.
 */
const APRON = 1;

/** How many tiles past the plot's edge the ground may be dug, per axis. */
function apronOf(tiles: number): number {
  return Math.round(tiles * APRON);
}

/**
 * The three tiles a plot that nobody has terraced is made of, shared rather than
 * rebuilt per ask.
 *
 * A tile is readonly and every caller either reads it or spreads it, so one
 * object apiece is safe — and the mesher asks about every tile of a box many
 * times the plot's area on every rebuild, so it is the difference between a
 * hundred thousand allocations and none.
 */
const SEA: TerrainTile = { level: 0, surface: 'water' };
const BEACH: TerrainTile = { level: 0, surface: 'sand' };
const PLAIN: TerrainTile = { level: 0, surface: 'grass' };

/** What a plot with no elevation spec climbs, shared for the same reason. */
const NO_TERRACES: readonly TerraceSpec[] = [];

/** What one tile of the plot is: how high it stands, and what it is made of. */
export interface TerrainTile {
  /** Levels above sea level; 0 at the beach. See `elevation.ts`. */
  readonly level: number;
  readonly surface: Ground;
}

/**
 * One tile the terrain has been changed on, as a plan can carry it.
 *
 * A flat record rather than a map entry, because this is what travels: a plan is
 * data, and a river a generator carved is a list of these on it. See
 * `river.ts`.
 */
export interface TerrainEdit extends TerrainTile {
  readonly tileX: number;
  readonly tileZ: number;
}

/** The plot dimensions, coast, terraces and hand edits a plan carries. */
export interface TerrainPlan extends ElevationPlan {
  readonly terrain?: readonly TerrainEdit[];
}

/**
 * The ground as the editor sees it.
 *
 * Mutable, and deliberately so: this is the live state of the plot, in the same
 * way `TileOccupancy` is the live state of what stands on it. Growing a new
 * resort makes a new one; editing one changes it in place.
 */
export interface Terrain {
  readonly tilesX: number;
  readonly tilesZ: number;
  /** The ground under a tile, edits included. Answers off the plot too. */
  tileAt(tileX: number, tileZ: number): TerrainTile;
  /** How many levels above sea level a tile stands. */
  levelOf(tileX: number, tileZ: number): number;
  /** What a tile is made of. */
  surfaceOf(tileX: number, tileZ: number): Ground;
  /**
   * Whether the tile is the sea — a fact about the plot rather than about the
   * tile as it stands, so an island still knows it is standing in the bay.
   */
  isSea(tileX: number, tileZ: number): boolean;
  /**
   * Whether the tile is inside the apron, which is the only ground an edit may
   * touch — the plot and a plot's width of ground all round it. Wider than the
   * plot, because ground can be dug where nothing can be built; see the note at
   * the top of the file.
   */
  holds(tileX: number, tileZ: number): boolean;
  /**
   * The highest level anywhere, which is where a pick starts its walk down.
   *
   * Never falls: lowering the one tile that was highest leaves this a level
   * above anything standing, which costs the pick one crossing that lands on no
   * ground and saves it walking the plot on every pointer move. See
   * `groundPick.ts`.
   */
  readonly maxLevel: number;
  /** Every tile an edit has changed, in the order the edits were made. */
  readonly edits: readonly TerrainEdit[];
  /**
   * Changes what one tile of the plot is.
   *
   * An edit that comes back to the base tile is dropped rather than stored, so
   * raising a tile and lowering it again leaves the plot as it was found.
   * Anything off the plot is ignored — see the note at the top of the file.
   */
  set(tileX: number, tileZ: number, tile: TerrainTile): void;
}

/**
 * Where one tile column's lines fall, rounded to whole tiles.
 *
 * The whole reason the base answer is cheap. A column's ground is decided by one
 * number per line strung across the plot — the first water tile, and the first
 * tile behind each step — and every one of those is a rounded meander, which is
 * a handful of trigonometry. The renderer asks about a hundred thousand tiles
 * per rebuild and they fall in a few hundred columns, so the lines are solved
 * once per column and the per-tile answer is a couple of comparisons against
 * them.
 */
interface ColumnLines {
  /** First water tile of the column, or `Infinity` on a plot with no sea. */
  readonly water: number;
  /** First tile behind each step, seaward to landward. */
  readonly steps: readonly number[];
}

function linesAt(shore: Shore | null, elevation: Elevation | null, tileX: number): ColumnLines {
  return {
    water: shore ? waterStartZ(shore, tileX) : Number.POSITIVE_INFINITY,
    steps: elevation
      ? elevation.spec.terraces.map((_, index) => stepStartZ(elevation, index, tileX))
      : [],
  };
}

export interface TerrainParts {
  readonly shore: Shore | null;
  readonly elevation: Elevation | null;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly edits?: readonly TerrainEdit[];
}

/**
 * The ground of a plot: its coast and its terraces, with any edits over them.
 *
 * Always a terrain, never null — a plot with no sea and no hill is a terrain
 * that answers grass at sea level everywhere. That is the one place this differs
 * from `shoreFor` and `elevationFor`, and it is worth the difference: every
 * caller downstream asks what the ground under a tile is, and not one of them
 * has a sensible second branch for a plot that has no ground.
 */
export function createTerrain(parts: TerrainParts): Terrain {
  const { shore, elevation, tilesX, tilesZ } = parts;
  /** One entry per column the plot or the renderer has asked about. */
  const lines = new Map<number, ColumnLines>();
  /**
   * Overrides by tile, keyed by index rather than by a string.
   *
   * The mesher asks about every tile in a box many times the plot's area, and a
   * string key would be an allocation per ask. Only tiles inside the apron can
   * be indexed this way, which is also the only ground an edit may touch — the
   * index runs over the apron rather than over the plot, so the tiles seaward of
   * it carry negative coordinates and still land in the same flat map.
   */
  const overrides = new Map<number, TerrainTile>();
  /** Insertion order, so `edits` reads back as the list a plan would carry. */
  const order: number[] = [];
  let ceiling = maxLevelOf(elevation);

  /** The apron's own rectangle: the plot grown by a plot's width all round. */
  const apron = {
    minX: -apronOf(tilesX),
    minZ: -apronOf(tilesZ),
    tilesX: tilesX + 2 * apronOf(tilesX),
    tilesZ: tilesZ + 2 * apronOf(tilesZ),
  };

  const holds = (tileX: number, tileZ: number): boolean =>
    tileX >= apron.minX &&
    tileX < apron.minX + apron.tilesX &&
    tileZ >= apron.minZ &&
    tileZ < apron.minZ + apron.tilesZ;

  const cellOf = (tileX: number, tileZ: number): number =>
    (tileZ - apron.minZ) * apron.tilesX + (tileX - apron.minX);

  const linesOf = (tileX: number): ColumnLines => {
    const known = lines.get(tileX);
    if (known) return known;
    const solved = linesAt(shore, elevation, tileX);
    lines.set(tileX, solved);
    return solved;
  };

  /**
   * The ground a tile would have if nobody had touched it.
   *
   * The same answer `groundAt` and `levelAt` give, off the same lines — the
   * tests assert that tile by tile, because everything above rests on an edited
   * plot and an unedited one being the same kind of thing.
   */
  const baseAt = (tileX: number, tileZ: number): TerrainTile => {
    const column = linesOf(tileX);
    if (tileZ >= column.water) return SEA;
    // The terraces run seaward to landward and their steps never cross, so the
    // walk stops at the first step the tile is not behind. See `terraceAt`. An
    // indexed loop over the spec's own array rather than anything that reads
    // more nicely: the mesher asks this about a hundred thousand tiles per
    // rebuild and an iterator's worth of garbage per terrace per tile is a
    // collection in the middle of a drag.
    const terraces = elevation?.spec.terraces ?? NO_TERRACES;
    let level = 0;
    let surface: Ground = 'grass';
    let standing = false;
    for (let index = 0; index < terraces.length; index++) {
      if (tileZ >= column.steps[index]!) break;
      const terrace = terraces[index]!;
      level = terrace.level;
      surface = terrace.surface ?? 'grass';
      standing = true;
    }
    if (standing) return { level, surface };
    return shore !== null && tileZ >= column.water - shore.spec.beach ? BEACH : PLAIN;
  };

  const tileAt = (tileX: number, tileZ: number): TerrainTile => {
    if (!holds(tileX, tileZ)) return baseAt(tileX, tileZ);
    return overrides.get(cellOf(tileX, tileZ)) ?? baseAt(tileX, tileZ);
  };

  const terrain: Terrain = {
    tilesX,
    tilesZ,
    tileAt,
    holds,
    levelOf: (tileX, tileZ) => tileAt(tileX, tileZ).level,
    surfaceOf: (tileX, tileZ) => tileAt(tileX, tileZ).surface,
    isSea: (tileX, tileZ) => baseAt(tileX, tileZ).surface === 'water',
    get maxLevel() {
      return ceiling;
    },
    get edits() {
      return order.map((cell) => {
        const row = Math.floor(cell / apron.tilesX);
        const tileZ = row + apron.minZ;
        const tileX = cell - row * apron.tilesX + apron.minX;
        return { tileX, tileZ, ...overrides.get(cell)! };
      });
    },
    set(tileX, tileZ, tile) {
      if (!holds(tileX, tileZ)) return;
      const cell = cellOf(tileX, tileZ);
      const base = baseAt(tileX, tileZ);
      if (tile.level === base.level && tile.surface === base.surface) {
        if (overrides.delete(cell)) order.splice(order.indexOf(cell), 1);
        return;
      }
      if (!overrides.has(cell)) order.push(cell);
      overrides.set(cell, tile);
      ceiling = Math.max(ceiling, tile.level);
    },
  };

  for (const edit of parts.edits ?? []) {
    terrain.set(edit.tileX, edit.tileZ, { level: edit.level, surface: edit.surface });
  }
  return terrain;
}

/** The eight tiles that touch one, corners included. */
const AROUND: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Whether any of the eight tiles around this one stands lower than it does.
 *
 * Which is the same as asking whether the renderer draws this tile's ground as
 * anything but a flat square — a tile with nothing lower beside it is one quad
 * and a tile that overlooks a drop is a slope, or a wall if something stands on
 * it. So it is what says whether standing something here changes the terrain at
 * all, which is what keeps a path dragged across a flat bench from rebuilding
 * the ground once a tile. See `rendering/domain/terrainSurface.ts`, which asks
 * the same question off its own column profiles because it asks it of every tile
 * in the box rather than of eight.
 */
export function overlooksDrop(terrain: Terrain, tileX: number, tileZ: number): boolean {
  const level = terrain.levelOf(tileX, tileZ);
  return AROUND.some(([dx, dz]) => terrain.levelOf(tileX + dx, tileZ + dz) < level);
}

/**
 * The ground a plan describes: its coast, its terraces and the edits it carries.
 *
 * The counterpart of `shoreFor` and `elevationFor`, and it throws for the same
 * reason `elevationFor` does — a plan whose steps cross is a mistake in the plan
 * and the plan is the only place it can be fixed.
 */
export function terrainFor(plan: TerrainPlan): Terrain {
  const shore = shoreFor(plan);
  const elevation = elevationFor(plan);
  return createTerrain({
    shore,
    elevation,
    tilesX: plan.tilesX,
    tilesZ: plan.tilesZ,
    ...(plan.terrain ? { edits: plan.terrain } : {}),
  });
}
