/**
 * How high off sea level each tile of the plot stands.
 *
 * The plot keeps its rectangle and its coast; what changes is that the land
 * behind the beach rises in **terraces** — flat benches separated by a step, the
 * way a resort cut into a slope actually sits. A tile's *level* is an integer,
 * 0 at sea level, and one level is `LEVEL_VOXELS` voxels up.
 *
 * Two invariants hold, and between them they are what makes everything
 * downstream tractable:
 *
 * - **Neighbouring tiles differ by at most one level.** A taller drop is two
 *   terraces a tile apart, which comes out as two staircases in a row rather
 *   than as a cliff no stair model could climb.
 * - **The beach is always level 0.** Terraces are anchored *landward* of the
 *   sand band, so a coastline that wanders cannot drag a step across the sand.
 *
 * Both are checked in {@link elevationFor}, per column of the plot, against the
 * rounded lines the layout will actually read — not against the spec's own
 * numbers, because a wobble of three tiles on lines four apart is a spec that
 * looks fine and crosses itself in one column out of thirty.
 *
 * Like `shoreline.ts` — and for the same reasons, which are worth reading there
 * — this is a **function of a tile column**, not a stored field: `stepStartZ(i,
 * x)` is where terrace `i`'s step runs in column `x`, and a tile's level falls
 * out of that one number. Nothing here is bounded by the plot either, because
 * the renderer draws the terraces out past the resort exactly as it draws the
 * sea past it.
 *
 * A plan with no elevation spec is flat, and every function here answers for
 * that case: `elevationFor` gives null and `levelAt(null, …)` is 0. That is what
 * lets the whole pipeline carry a level through without a single caller having
 * to ask whether the plot it is laying out has terraces on it.
 */

import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { shoreFor, waterEdgeZ, waterStartZ, type Shore, type ShorePlan } from './shoreline';
import { meanderAt } from './wander';

/** One bench of the terraced land, and the step up onto it. */
export interface TerraceSpec {
  /** Level the land stands at behind this step. Differs by one from the last. */
  readonly level: number;
  /**
   * Where the step runs, in tiles landward of the water's edge.
   *
   * Measured off the water rather than off the plot's edge so the terraces
   * follow the coast: the sand band is a fixed depth, so a step a fixed distance
   * in from the water is a step a fixed distance behind the sand however the
   * coastline wanders. Must grow from one terrace to the next — the list runs
   * seaward to landward.
   */
  readonly fromWater: number;
  /** How far this step strays off a straight line, in tiles. */
  readonly wave: number;
}

/** How the land rises behind the beach. Optional on a plan: no spec, no terraces. */
export interface ElevationSpec {
  readonly terraces: readonly TerraceSpec[];
  /** Any integer; the same one gives the same steps. */
  readonly seed: number;
}

/** An elevation spec anchored on a plot, and on the coast it is measured off. */
export interface Elevation {
  readonly spec: ElevationSpec;
  /** The coast the steps are measured from, or null on a plot with no sea. */
  readonly shore: Shore | null;
  readonly tilesX: number;
  readonly tilesZ: number;
}

/** The plot dimensions, shore spec and elevation spec a plan carries. */
export interface ElevationPlan extends ShorePlan {
  readonly elevation?: ElevationSpec;
}

/**
 * The salt each step's meander is drawn with.
 *
 * Offset clear of the coast's own salt so a terrace does not wander in step with
 * the water in front of it, and two apart per terrace because one meander burns
 * two phases. See `wander.ts`, and `SHORE_SALT` in `shoreline.ts`.
 */
const stepSalt = (index: number): number => 3 + index * 2;

/** How far above sea level a level stands, in voxels. */
export function levelHeight(level: number): number {
  return level * LEVEL_VOXELS;
}

/**
 * Where the terraces are measured from: the water's edge, or — on a plot with
 * no sea — the plot's own southern edge, which is where the water would be.
 */
function anchorZ(elevation: Elevation, tileX: number): number {
  return elevation.shore ? waterEdgeZ(elevation.shore, tileX) : elevation.tilesZ - 1;
}

/**
 * Where one terrace's step runs at any `x`, unrounded.
 *
 * The counterpart of `waterEdgeZ`, and it exists for the counterpart reason:
 * everything that *places* something works in whole tiles and wants
 * {@link stepStartZ}, but the surface that draws a terrace wants the curve, so
 * the riser it builds does not band along the column boundaries. `tileX` may
 * therefore be fractional here.
 */
export function stepEdgeZ(elevation: Elevation, index: number, tileX: number): number {
  const terrace = elevation.spec.terraces[index];
  if (!terrace) throw new Error(`The plot has no terrace ${index}`);
  return (
    anchorZ(elevation, tileX) -
    terrace.fromWater +
    meanderAt(elevation.spec.seed, stepSalt(index), tileX, terrace.wave)
  );
}

/**
 * The first tile of a column that stands on one terrace: everything at a
 * smaller z is on it or above it, everything from here on is below it.
 *
 * May fall outside the plot in either direction, exactly as `waterStartZ` may:
 * a column the coast bulges south on carries its terraces south with it.
 */
export function stepStartZ(elevation: Elevation, index: number, tileX: number): number {
  return Math.round(stepEdgeZ(elevation, index, tileX));
}

/**
 * How many levels above sea level a tile stands. Everything is 0 on a plan with
 * no terraces.
 *
 * The terraces run seaward to landward and their steps never cross, so the walk
 * can stop at the first step the tile is *not* behind: it cannot be behind any
 * of the ones after it either.
 */
export function levelAt(elevation: Elevation | null, tileX: number, tileZ: number): number {
  if (!elevation) return 0;
  let level = 0;
  for (const [index, terrace] of elevation.spec.terraces.entries()) {
    if (tileZ >= stepStartZ(elevation, index, tileX)) break;
    level = terrace.level;
  }
  return level;
}

/**
 * The highest level anywhere on the plot.
 *
 * Read by the two callers that have to walk every level rather than ask about
 * one tile: the surface that draws the terraces, and the pointer, which tests
 * the levels from the top down so a terrace in front hides the ground behind it.
 */
export function maxLevelOf(elevation: Elevation | null): number {
  if (!elevation) return 0;
  return elevation.spec.terraces.reduce((highest, terrace) => Math.max(highest, terrace.level), 0);
}

/**
 * Anchors a plan's terraces on its plot, or null when the plan is flat.
 *
 * Throws on a spec that cannot be built rather than laying out something quietly
 * wrong, which is the same bargain `layoutResort` strikes with a plan that
 * overlaps: a plot whose steps cross is a mistake in the plan, and the plan is
 * the only place it can be fixed.
 */
export function elevationFor(plan: ElevationPlan): Elevation | null {
  if (!plan.elevation || plan.elevation.terraces.length === 0) return null;
  const elevation: Elevation = {
    spec: plan.elevation,
    shore: shoreFor(plan),
    tilesX: plan.tilesX,
    tilesZ: plan.tilesZ,
  };
  requireOneLevelPerStep(elevation);
  requireStepsApart(elevation);
  requireLevelBeach(elevation);
  return elevation;
}

/**
 * Throws unless every step is exactly one level, and the terraces run seaward to
 * landward.
 *
 * One level per step is the invariant the stairs rest on: a tile of stairs
 * climbs `LEVEL_VOXELS` and no more, so a two-level step is a step nothing in
 * the catalogue can get up. It is checked here, once, rather than wherever a
 * stair is laid.
 */
function requireOneLevelPerStep(elevation: Elevation): void {
  let last = 0;
  let lastFromWater = Number.NEGATIVE_INFINITY;
  for (const [index, terrace] of elevation.spec.terraces.entries()) {
    if (Math.abs(terrace.level - last) !== 1) {
      throw new Error(
        `Terrace ${index} steps from level ${last} to ${terrace.level}; a step is one level`,
      );
    }
    if (terrace.fromWater <= lastFromWater) {
      throw new Error(`Terrace ${index} is not landward of the one before it`);
    }
    last = terrace.level;
    lastFromWater = terrace.fromWater;
  }
}

/**
 * Throws if two steps meet in any column of the plot.
 *
 * Checked against the rounded lines the layout will read, column by column,
 * because that is the only place the answer lives: two steps four tiles apart
 * with three tiles of wobble on each are a spec that reads as fine and collides
 * in one column out of thirty. Where they met, one tile would carry two steps,
 * and no single stair could climb it.
 */
function requireStepsApart(elevation: Elevation): void {
  for (let index = 1; index < elevation.spec.terraces.length; index++) {
    for (let tileX = 0; tileX < elevation.tilesX; tileX++) {
      const behind = stepStartZ(elevation, index, tileX);
      const infront = stepStartZ(elevation, index - 1, tileX);
      if (behind >= infront) {
        throw new Error(`Terraces ${index - 1} and ${index} meet at column ${tileX}`);
      }
    }
  }
}

/**
 * Throws if the seaward-most step cuts into the sand.
 *
 * The beach is level 0 across its whole depth, which is what lets the sand
 * surface stay the flat sheet it is and lets a boardwalk run out to the water
 * without a stair in it. A plot with no sea has no sand to protect.
 */
function requireLevelBeach(elevation: Elevation): void {
  const { shore } = elevation;
  if (!shore) return;
  for (let tileX = 0; tileX < elevation.tilesX; tileX++) {
    const grass = waterStartZ(shore, tileX) - shore.spec.beach;
    if (stepStartZ(elevation, 0, tileX) > grass) {
      throw new Error(`The first terrace steps onto the beach at column ${tileX}`);
    }
  }
}
