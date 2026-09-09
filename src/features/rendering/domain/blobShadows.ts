/**
 * The shadow each object throws across the ground, as one soft quad.
 *
 * These are blobs, not shadows: an object's silhouette is not in them, only the
 * box it stands in. What they give is the thing the baked sky visibility cannot
 * — a dark shape lying on the ground *beside* an object, leaning away from the
 * sun and swinging as the day passes.
 *
 * **Why they are cast beside rather than under.** A contact patch under an
 * object is the usual reason to draw a blob: it plants a thing that would
 * otherwise read as a sticker on the grass. This catalogue does not need one.
 * Every model paints its own ground plate over the whole footprint it claims —
 * all thirty-one of them cover 100% of it at their lowest layer — so the ground
 * an object stands on is already the object, and a patch drawn under it would be
 * inside opaque geometry. What is missing is the ground *around* it, and that is
 * what this draws.
 *
 * **What it approximates.** The shadow of a box of footprint `w x d` and height
 * `h`, under a sun at elevation `e`, is that footprint swept `h / tan(e)` along
 * the ground away from the sun. So the quad is the footprint, grown by half the
 * sweep in each direction and shifted by the other half: it starts under the
 * object and runs out onto the grass, and the half still under the object is
 * hidden by the object, which is exactly where a real shadow is hidden too.
 *
 * The sweep runs away without bound as the sun nears the horizon, so it is
 * capped — and by the time the cap binds, {@link ShadowCast.strength} has faded
 * most of the way to nothing anyway, which is also what keeps a sun shadow from
 * being drawn after dark while the lamps are lit.
 */

import type { Vector3 } from '../../lighting/domain/dayNight';

/**
 * How tall a thing has to stand before it is given a shadow, in voxels.
 *
 * The same rule the sky-visibility bake applies, for the same reason: a path
 * slab is two voxels of paving lying flat, its shadow never leaves its own
 * footprint at any hour, and there are three and a half thousand of them.
 */
export const MIN_CAST_HEIGHT = 4;

/**
 * How far a shadow may run, in multiples of the height casting it.
 *
 * Real shadows reach the horizon at sunrise. Drawn, that is a black streak
 * across three districts from every lamp post on the plot — and drawn as *this*,
 * a blob with no silhouette in it, it would be a black streak that is also
 * wrong. Three times the caster's height is about a 70° sun, past which the
 * shape stops growing and only fades.
 */
export const MAX_CAST_LENGTH = 3;

/** How dark a shadow is under a high sun, before its own edge falloff. */
export const BLOB_OPACITY = 0.42;

/**
 * Sun elevation, as the y of a unit direction, at which shadows reach full
 * strength. Below it they fade, and by the horizon they are gone.
 */
const FULL_SHADOW_ELEVATION = 0.25;

/** How far the quad spreads past the footprint it stands in for. */
const BLOB_SPREAD = 1.05;

/** An object, as far as the shadow it throws is concerned. */
export interface ShadowCaster {
  readonly key: string;
  /** World-space corner of the model itself, in voxels. */
  readonly x: number;
  readonly z: number;
  /** The model's extents as it stands, turn included. */
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/**
 * One object's shadow, before the sun is applied: where it stands and what it
 * has to sweep.
 *
 * Kept apart from the quad it becomes because these never change and the quad
 * changes with the hour.
 */
export interface BlobShadow {
  readonly key: string;
  /** Centre of the footprint, in voxels. */
  readonly x: number;
  readonly z: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly height: number;
}

/** The shadow one object throws, or null if it is too flat to throw one. */
export function blobShadowFor(caster: ShadowCaster): BlobShadow | null {
  if (caster.height < MIN_CAST_HEIGHT) return null;
  return {
    key: caster.key,
    x: caster.x + caster.width / 2,
    z: caster.z + caster.depth / 2,
    halfWidth: (caster.width / 2) * BLOB_SPREAD,
    halfDepth: (caster.depth / 2) * BLOB_SPREAD,
    height: caster.height,
  };
}

/** Every shadow a set of placements throws, skipping the ones that throw none. */
export function blobShadowsFor(casters: readonly ShadowCaster[]): BlobShadow[] {
  const blobs: BlobShadow[] = [];
  for (const caster of casters) {
    const blob = blobShadowFor(caster);
    if (blob) blobs.push(blob);
  }
  return blobs;
}

export interface ShadowCast {
  /** How dark every shadow is drawn, 0 when the sun is down. */
  readonly strength: number;
  /**
   * Ground distance a shadow runs per voxel of the height casting it, split
   * into its two axes. Points away from the sun.
   */
  readonly runX: number;
  readonly runZ: number;
}

/** A cast that draws nothing, which is every hour the sun is below the horizon. */
const NO_CAST: ShadowCast = { strength: 0, runX: 0, runZ: 0 };

/**
 * How the sun's position stretches and fades every shadow on the plot.
 *
 * One answer for the whole resort: the sun is the same distance away from all of
 * it, so what differs between two objects is only the height each one has to
 * sweep, which is already in its {@link BlobShadow}.
 */
export function shadowCastFor(sunDirection: Vector3): ShadowCast {
  const elevation = sunDirection.y;
  if (elevation <= 0) return NO_CAST;

  const strength = BLOB_OPACITY * Math.min(1, elevation / FULL_SHADOW_ELEVATION);
  const horizontal = Math.hypot(sunDirection.x, sunDirection.z);
  // A sun exactly overhead throws nothing sideways, and has no direction to
  // throw it in either.
  if (horizontal <= 0) return { strength, runX: 0, runZ: 0 };

  const run = Math.min(MAX_CAST_LENGTH, horizontal / elevation);
  return {
    strength,
    runX: (-sunDirection.x / horizontal) * run,
    runZ: (-sunDirection.z / horizontal) * run,
  };
}

/** Where a shadow's quad lies and how big it is, at one moment of the day. */
export interface ShadowQuad {
  readonly x: number;
  readonly z: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
}

/**
 * One shadow's quad under a given sun.
 *
 * The sweep is split in half between the shift and the growth, which is what
 * makes the shadow run *out of* the object rather than jump clear of it: at any
 * hour one end is still under the thing casting it.
 */
export function shadowQuadFor(blob: BlobShadow, cast: ShadowCast): ShadowQuad {
  const runX = blob.height * cast.runX;
  const runZ = blob.height * cast.runZ;
  return {
    x: blob.x + runX / 2,
    z: blob.z + runZ / 2,
    halfWidth: blob.halfWidth + Math.abs(runX) / 2,
    halfDepth: blob.halfDepth + Math.abs(runZ) / 2,
  };
}

/**
 * Whether two casts differ enough to be worth rewriting every quad for.
 *
 * The quads are instance matrices, so moving the sun costs a write per shadow on
 * the plot — cheap at a few thousand, and pointless when the slider has not
 * moved and the cycle is not running.
 */
export function castsDiffer(a: ShadowCast, b: ShadowCast): boolean {
  const epsilon = 1e-4;
  return (
    Math.abs(a.strength - b.strength) > epsilon ||
    Math.abs(a.runX - b.runX) > epsilon ||
    Math.abs(a.runZ - b.runZ) > epsilon
  );
}
