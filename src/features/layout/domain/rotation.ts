/**
 * Quarter turns about an object's own vertical axis.
 *
 * A resort where every building faced the same way reads as a housing estate
 * rather than as a resort, so objects are turned: by the generator as it lays a
 * plot out, and by the pointer while something is being placed. Both go through
 * here, and so does everything that has to agree with them — the footprint a
 * turned object claims on the tile grid, the matrix its instances are drawn
 * with, and where its lamps end up.
 *
 * Quarter turns and nothing finer, because a voxel model is an axis-aligned
 * box. Turn one by anything else and its footprint stops being a whole number
 * of tiles, its voxels stop lining up with the ground, and the coplanar faces
 * the greedy mesher merged stop lying flat against the grid. A quarter turn
 * leaves all of that exactly as it was and costs nothing but a different
 * instance matrix — no second geometry, no second bucket, no re-mesh.
 *
 * The convention is the renderer's: a turn of `n` is `n * 90°` about Y in the
 * sense `Matrix4.makeRotationY` takes, which on this plot — north at z = 0 —
 * swings the model's north face round to face west. Turning about the origin
 * sends most of the box negative, so every mapping here folds in the
 * translation that brings it back to its own corner: {@link turnedOrigin} is
 * that translation on its own, and {@link rotatePoint} is it applied.
 */

import type { ModelLight } from '../../../../voxel-gen/voxelgen.ts';

/** Quarter turns an object stands at. */
export type Rotation = 0 | 1 | 2 | 3;

/** Every turn there is, in order. */
export const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

/**
 * A size or an offset on the ground plane, in whichever unit the caller works
 * in: tiles for a footprint, voxels for a model.
 */
export interface Extent {
  readonly x: number;
  readonly z: number;
}

/** Brings any number of quarter turns, in either direction, into 0..3. */
export function normalizeRotation(turns: number): Rotation {
  return (((Math.trunc(turns) % 4) + 4) % 4) as Rotation;
}

/** Radians for a turn, in the sense `Matrix4.makeRotationY` takes. */
export function rotationRadians(rotation: Rotation): number {
  return (rotation * Math.PI) / 2;
}

/**
 * Whether a turn swaps the two ground axes.
 *
 * This is the whole reason a turn is not free: an odd turn makes a 2x3 cottage
 * claim 3x2 tiles, so it is the tile grid, not the renderer, that decides
 * whether an object may stand a given way round.
 */
export function swapsAxes(rotation: Rotation): boolean {
  return rotation % 2 === 1;
}

/** A box's size after the turn: an odd turn swaps its axes, an even one does not. */
export function rotateExtent(x: number, z: number, rotation: Rotation): Extent {
  return swapsAxes(rotation) ? { x: z, z: x } : { x, z };
}

/**
 * The corner of the turned box that the model's own origin lands on, given the
 * box's size *after* the turn.
 *
 * A rotation matrix turns about the origin, which puts three quarters of the
 * turns partly behind it; this is the translation that brings the box back into
 * its own footprint, and it is what an instance matrix adds on top of the turn.
 */
export function turnedOrigin(width: number, depth: number, rotation: Rotation): Extent {
  switch (rotation) {
    case 1:
      return { x: 0, z: depth };
    case 2:
      return { x: width, z: depth };
    case 3:
      return { x: width, z: 0 };
    default:
      return { x: 0, z: 0 };
  }
}

/**
 * Where a point of a model ends up once the model is turned, in the turned
 * box's own coordinates.
 *
 * `width` and `depth` are the model's size *before* the turn, because that is
 * the box the point was measured against. This is the same mapping the instance
 * matrix performs, which is what keeps a lamp inside the lantern it was
 * declared in however the post is turned.
 */
export function rotatePoint(
  point: Extent,
  width: number,
  depth: number,
  rotation: Rotation,
): Extent {
  switch (rotation) {
    case 1:
      return { x: point.z, z: width - point.x };
    case 2:
      return { x: width - point.x, z: depth - point.z };
    case 3:
      return { x: depth - point.z, z: point.x };
    default:
      return { x: point.x, z: point.z };
  }
}

/**
 * A model's lights, moved to where a turned model puts them.
 *
 * Height is untouched: a turn about the vertical axis does not raise or lower
 * anything. An unturned model hands its own list straight back, which is most
 * of the catalogue and every path tile on the plot.
 */
export function rotateLights(
  lights: readonly ModelLight[],
  width: number,
  depth: number,
  rotation: Rotation,
): readonly ModelLight[] {
  if (rotation === 0 || lights.length === 0) return lights;
  return lights.map((light) => ({
    ...light,
    ...rotatePoint(light, width, depth, rotation),
  }));
}
