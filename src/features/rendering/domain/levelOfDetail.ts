/**
 * How much of the resort is worth drawing, from how big it comes out on screen.
 *
 * Chunking lets the renderer skip what is off screen (see `spatialChunks.ts`);
 * this decides what to do with what is on screen but far away or tiny. Two
 * questions, both answered in pixels per voxel:
 *
 * - **Is a region far?** Once one voxel of a coarse copy — a model re-voxelised
 *   at twice the voxel size, see `voxel-world/domain/coarseVoxels.ts` — covers
 *   no more than a pixel and a half, the swap to it is below what the screen can
 *   show. A far region is drawn as one coarse draw per model for the whole
 *   region rather than one full draw per model per chunk in it, which is where
 *   the draw calls a zoomed-out resort costs actually go.
 * - **Is an object hidden?** Once the whole object is a few pixels across, it is
 *   not drawn at all.
 *
 * Pixels per voxel is the one number both cameras can answer: a perspective
 * camera's falls off with distance, an orthographic camera's is the same
 * everywhere and follows the zoom. The pixels are the drawing buffer's, device
 * pixel ratio included, because those are the pixels the detail is spent on.
 *
 * An answer that has been given is changed only once the number has moved past
 * its threshold by {@link DETAIL_HYSTERESIS}, so a region sitting on a boundary
 * does not flicker between two draws as the camera drifts.
 */

import { COARSE_SCALE } from '../../voxel-world/domain/coarseVoxels';

/** How a camera turns voxels into pixels. */
export type DetailLens =
  | {
      readonly kind: 'perspective';
      /** Pixels one voxel covers at one voxel's distance. */
      readonly focalPixels: number;
    }
  | {
      readonly kind: 'orthographic';
      /** Pixels one voxel covers, wherever it stands. */
      readonly pixelsPerVoxel: number;
    };

/** Where a camera stands and how it sees: everything a level is chosen from. */
export interface DetailView {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly lens: DetailLens;
}

/**
 * Pixels a coarse voxel may cover before a region is too near to draw coarse.
 *
 * A pixel and a half: the rasteriser and the multisampling between them blur a
 * step that small into the one beside it.
 */
export const COARSE_VOXEL_PIXELS = 1.5;

/** Pixels across below which an object is not drawn at all. */
export const HIDDEN_PIXELS = 3;

/** How far past a threshold the answer has to move to change. */
export const DETAIL_HYSTERESIS = 1.2;

/**
 * The share of the full model's triangles a coarse model may keep and still be
 * worth uploading.
 *
 * A boxy building is already a handful of merged quads, and re-voxelising it
 * saves little while it thickens every wall; such a model is drawn far away
 * with its own geometry instead.
 */
const COARSE_TRIANGLE_SHARE = 0.6;

export function perspectiveLens(bufferHeight: number, verticalFovDegrees: number): DetailLens {
  const halfFov = (verticalFovDegrees * Math.PI) / 360;
  return { kind: 'perspective', focalPixels: bufferHeight / (2 * Math.tan(halfFov)) };
}

/** `viewHeight` is how many voxels the view spans top to bottom, zoom included. */
export function orthographicLens(bufferHeight: number, viewHeight: number): DetailLens {
  return { kind: 'orthographic', pixelsPerVoxel: bufferHeight / Math.max(viewHeight, 1e-6) };
}

/** Pixels a voxel covers `distance` voxels from the camera. */
export function pixelsPerVoxel(lens: DetailLens, distance: number): number {
  if (lens.kind === 'orthographic') return lens.pixelsPerVoxel;
  return lens.focalPixels / Math.max(distance, 1);
}

export interface DetailBox {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/** Distance from a point to the nearest point of a box; zero inside it. */
export function distanceToBox(x: number, y: number, z: number, box: DetailBox): number {
  const dx = Math.max(box.minX - x, 0, x - box.maxX);
  const dy = Math.max(box.minY - y, 0, y - box.maxY);
  const dz = Math.max(box.minZ - z, 0, z - box.maxZ);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Whether an answer is below a threshold, leaning towards the side it was on:
 * `wasBelow` holds it below until the number is clearly above, and the other way
 * round.
 */
const below = (value: number, threshold: number, wasBelow: boolean): boolean =>
  wasBelow ? value <= threshold * DETAIL_HYSTERESIS : value < threshold;

/**
 * Whether a region is far enough to draw from coarse copies, judged at its
 * nearest point: a coarse voxel there covers no more than
 * {@link COARSE_VOXEL_PIXELS}.
 */
export function isFar(wasFar: boolean, pixelsPerVoxelHere: number): boolean {
  return below(pixelsPerVoxelHere, COARSE_VOXEL_PIXELS / COARSE_SCALE, wasFar);
}

/**
 * Pixels one voxel has to cover at a region's nearest point for the region to
 * be drawn a chunk at a time.
 *
 * **The renderer's cost is per draw, not per triangle.** Measured on a 400-tile
 * plot, Three.js spends about 14 µs of main thread on every draw; a chunk is
 * sixteen draws per model where its region is one. Chunks only pay for that
 * where the frustum can throw most of a region away, which is up close: three
 * pixels a voxel is about 130 m through the perspective lens. Beyond it a
 * region is drawn whole, in full detail, until it is far enough to be coarse.
 */
export const CHUNKED_VOXEL_PIXELS = 3;

/**
 * How a region is drawn: a chunk at a time in full (`near`), whole in full
 * (`mid`), or whole from coarse copies (`far`).
 */
export type RegionLevel = 'near' | 'mid' | 'far';

/**
 * The level a region is drawn at from how large a voxel comes out at its
 * nearest point, leaning towards the level it was drawn at last.
 */
export function regionLevelOf(
  previous: RegionLevel | null,
  pixelsPerVoxelHere: number,
): RegionLevel {
  if (isFar(previous === 'far', pixelsPerVoxelHere)) return 'far';
  const chunked = !below(pixelsPerVoxelHere, CHUNKED_VOXEL_PIXELS, previous !== 'near');
  return chunked ? 'near' : 'mid';
}

/** Whether an object `extent` voxels across is too small on screen to draw. */
export function isHidden(wasHidden: boolean, pixelsPerVoxelHere: number, extent: number): boolean {
  return below(pixelsPerVoxelHere, HIDDEN_PIXELS / Math.max(extent, 1e-6), wasHidden);
}

/**
 * Whether something with no state of its own — a person, redrawn every frame —
 * is big enough on screen to draw. No hysteresis: a figure three pixels tall is
 * gone or there with nothing to see either way.
 */
export function standsOut(pixelsPerVoxelHere: number, extent: number): boolean {
  return pixelsPerVoxelHere * extent >= HIDDEN_PIXELS;
}

/** Whether a coarse model saves enough of the full one's triangles to keep. */
export function worthCoarsening(fullTriangles: number, coarseTriangles: number): boolean {
  return coarseTriangles > 0 && coarseTriangles <= fullTriangles * COARSE_TRIANGLE_SHARE;
}
