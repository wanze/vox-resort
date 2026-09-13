/**
 * Buildings that take time to go up.
 *
 * Placing a hotel used to put a hotel there. This module is the clock that says
 * a building starts as a foundation and fills in, and how far up it has got at
 * any moment; `adapters/constructionField.ts` is what draws the half-built
 * thing, and `showcase.ts` is what holds the sites and stands the building when
 * its site finishes.
 *
 * **The stages are computed, never authored.** The catalogue is meshed through
 * DVE once per page load and there is no runtime re-mesh path, so a stage
 * cannot be a geometry of its own — and authoring one per model per stage would
 * be four times the art for a prototype. What there is instead is one number,
 * how far up the model the building has reached, and a shader that discards
 * everything above it. Add a model to `voxel-gen/` and it gets a construction
 * animation the same way it gets a preview: by existing.
 *
 * The caller owns the state, the way `hud/domain/fps.ts` does: a site is a
 * value, `advanceSites` folds a frame into a list of them and hands back a new
 * list, and nothing here holds anything between calls.
 */

import type { ModelCategory } from '../../../../voxel-gen/voxelgen.ts';
import { MAX_STEP } from '../../crowd/domain/crowd';
import type { Placement } from '../../layout/domain/resortLayout';

/** What the clock needs to know about a model; the catalogue has all of it. */
export interface BuildModel {
  /** The build palette's shelf: `lodging`, `amenities`, `grounds`, `leisure`. */
  readonly category: ModelCategory;
  /** The model's height, in voxels. */
  readonly height: number;
  /** How many voxels the model paints. */
  readonly voxelCount: number;
}

/** A building going up: which placement, how tall, and how far through. */
export interface ConstructionSite {
  readonly placement: Placement;
  /** The model's height in voxels, which is what the reveal is measured in. */
  readonly height: number;
  /** How long the whole build takes, in seconds. */
  readonly duration: number;
  /** How much of that has passed, never past `duration`. */
  readonly elapsed: number;
}

/** One frame's worth of building work. */
export interface ConstructionTick {
  /** The sites still going up. */
  readonly sites: readonly ConstructionSite[];
  /** The sites that finished on this frame, and so must now be stood. */
  readonly finished: readonly ConstructionSite[];
}

/**
 * The shelves whose objects are built rather than simply put down.
 *
 * A building is a thing with a door. Everything on the `grounds` shelf is
 * scenery, paving or a lamp — most of it painted by dragging, dozens of tiles
 * per stroke, where a timer would fight the tool — and `leisure` is pools,
 * courts and playgrounds, which are holes in the ground and flat surfaces
 * rather than walls going up. Neither reads as construction, so neither gets it.
 */
const BUILT_CATEGORIES: ReadonlySet<ModelCategory> = new Set<ModelCategory>([
  'lodging',
  'amenities',
]);

/**
 * How much model it takes before something counts as a building.
 *
 * `amenities` runs from a beach shower to a supermarket, and a shower that took
 * four seconds to appear would read as a bug rather than as a building site.
 * Voxels rather than height, because height alone lets a sign post through and
 * keeps a long low restaurant out.
 */
const MIN_BUILD_VOXELS = 3000;

/** The shortest a build can take, before its size is counted at all. */
const BASE_SECONDS = 2;

/**
 * How fast the work goes, in root-voxels a second.
 *
 * The root is the point. A hotel paints twenty-three times the voxels a
 * changing block does, and a hotel that took twenty-three times as long would
 * be a hotel nobody watched finish. What the eye reads as a building's size is
 * its facade rather than its volume, and a facade grows as the square root of
 * what is behind it — so the square root is both the honest measure and the
 * one that puts the whole catalogue in a range worth watching: a changing block
 * four seconds, a cottage eight, a villa twelve, the hotel twenty-one.
 */
const ROOT_VOXELS_PER_SECOND = 25;

/** However large the model, nobody watches a building site for longer than this. */
const MAX_SECONDS = 24;

/**
 * The courses that are there the moment the site is pegged out.
 *
 * Without it a building placed is a building invisible until the reveal clears
 * its first layer, which reads as a misclick. With it, placing something lays
 * its floor slab — and "first you have the ground, then it fills in" is the
 * whole shape of the animation.
 *
 * Half a voxel, because a voxel face sits on an integer and the shader keeps
 * what is strictly below the line: a floor whose top face lay exactly on the
 * line would be a slab with its top missing, for as long as the slab is all
 * there is. The reveal itself passes through the integers too, but only for a
 * frame; this clamp sits on one.
 */
export const FOUNDATION_VOXELS = 2.5;

/**
 * How far one voxel can run ahead of the one beside it, on top of the lead.
 *
 * Small on purpose: this is the grain that puts individual voxels at the
 * frontier rather than a clean stair edge, and it is the per-cell hash rather
 * than the per-column one. See `leadVoxels` for the structure it sits on.
 */
export const GRAIN_VOXELS = 1.5;

/**
 * How far one voxel column can run ahead of the one beside it.
 *
 * This is what stops the reveal reading as a clipping plane sliding up through
 * a finished model. A share of the model's own height rather than a constant,
 * because the same four voxels of raggedness that give a bungalow a building
 * site give a hotel a hairline — and with a floor under it, so a low wide
 * restaurant still goes up unevenly.
 */
export function leadVoxels(height: number): number {
  return Math.max(6, height * 0.35);
}

/**
 * How long this model takes to go up, or zero if it should simply appear.
 *
 * One function rather than a predicate and a duration, so there is no way to
 * ask whether something is built and forget to ask how long it takes.
 */
export function buildSeconds(model: BuildModel): number {
  if (!BUILT_CATEGORIES.has(model.category)) return 0;
  if (model.voxelCount < MIN_BUILD_VOXELS) return 0;
  return Math.min(BASE_SECONDS + Math.sqrt(model.voxelCount) / ROOT_VOXELS_PER_SECOND, MAX_SECONDS);
}

/** Pegs out a site for a placement that has just been made. */
export function openSite(placement: Placement, height: number, duration: number): ConstructionSite {
  return { placement, height, duration, elapsed: 0 };
}

/**
 * Folds one frame into every site.
 *
 * The step is clamped exactly as the crowd's is, and for the same reason: a
 * backgrounded tab hands back a `dt` of minutes, and a resort whose every site
 * completed while nobody was looking is a resort that never showed the thing
 * this module exists for.
 */
export function advanceSites(sites: readonly ConstructionSite[], dt: number): ConstructionTick {
  if (sites.length === 0) return { sites, finished: sites };
  const step = Math.min(Math.max(dt, 0), MAX_STEP);
  const going: ConstructionSite[] = [];
  const finished: ConstructionSite[] = [];
  for (const site of sites) {
    // Clamped rather than left to run over, so `progressOf` never passes one
    // and the last frame of a build draws the model whole rather than beyond.
    const elapsed = Math.min(site.elapsed + step, site.duration);
    const next = { ...site, elapsed };
    if (elapsed >= site.duration) finished.push(next);
    else going.push(next);
  }
  return { sites: going, finished };
}

/** How far through its build a site is, 0 to 1. */
export function progressOf(site: ConstructionSite): number {
  if (site.duration <= 0) return 1;
  return Math.min(Math.max(site.elapsed / site.duration, 0), 1);
}

/**
 * How far up the model the reveal has reached, in the model's own voxels.
 *
 * Eased rather than linear: a constant rate reads as a machine, and smoothstep
 * puts the slow part at both ends — which is a foundation that sits there being
 * a foundation for a moment, and a roof that settles rather than snaps on.
 *
 * It runs past the model's own top by the whole of the lead and the grain,
 * because those are subtracted per column in the shader: stop at `height` and
 * the laggiest column is still short of its last voxel, and the building never
 * finishes being built.
 */
export function revealHeightOf(progress: number, height: number): number {
  const at = Math.min(Math.max(progress, 0), 1);
  const eased = at * at * (3 - 2 * at);
  return eased * (height + leadVoxels(height) + GRAIN_VOXELS);
}
