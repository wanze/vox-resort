import { COARSE_SCALE } from '../../voxel-world/domain/coarseVoxels';

export type DetailLens =
  | {
      readonly kind: 'perspective';
      readonly focalPixels: number;
    }
  | {
      readonly kind: 'orthographic';
      readonly pixelsPerVoxel: number;
    };

export interface DetailView {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly lens: DetailLens;
}

// The rasteriser and multisampling blur a step that small into the one beside it.
export const COARSE_VOXEL_PIXELS = 1.5;

export const HIDDEN_PIXELS = 3;

export const DETAIL_HYSTERESIS = 1.2;

// A boxy building is already a few merged quads; re-voxelising it saves little and thickens every wall.
const COARSE_TRIANGLE_SHARE = 0.6;

export function perspectiveLens(bufferHeight: number, verticalFovDegrees: number): DetailLens {
  const halfFov = (verticalFovDegrees * Math.PI) / 360;
  return { kind: 'perspective', focalPixels: bufferHeight / (2 * Math.tan(halfFov)) };
}

export function orthographicLens(bufferHeight: number, viewHeight: number): DetailLens {
  return { kind: 'orthographic', pixelsPerVoxel: bufferHeight / Math.max(viewHeight, 1e-6) };
}

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

export function distanceToBox(x: number, y: number, z: number, box: DetailBox): number {
  const dx = Math.max(box.minX - x, 0, x - box.maxX);
  const dy = Math.max(box.minY - y, 0, y - box.maxY);
  const dz = Math.max(box.minZ - z, 0, z - box.maxZ);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const below = (value: number, threshold: number, wasBelow: boolean): boolean =>
  wasBelow ? value <= threshold * DETAIL_HYSTERESIS : value < threshold;

export function isFar(wasFar: boolean, pixelsPerVoxelHere: number): boolean {
  return below(pixelsPerVoxelHere, COARSE_VOXEL_PIXELS / COARSE_SCALE, wasFar);
}

// Cost is per draw, not per triangle: Three.js spends about 14 µs of main thread per draw, and a chunk
// is sixteen draws per model where its region is one. Three pixels a voxel is about 130 m in perspective.
export const CHUNKED_VOXEL_PIXELS = 3;

export type RegionLevel = 'near' | 'mid' | 'far';

export function regionLevelOf(
  previous: RegionLevel | null,
  pixelsPerVoxelHere: number,
): RegionLevel {
  if (isFar(previous === 'far', pixelsPerVoxelHere)) return 'far';
  const chunked = !below(pixelsPerVoxelHere, CHUNKED_VOXEL_PIXELS, previous !== 'near');
  return chunked ? 'near' : 'mid';
}

export function isHidden(wasHidden: boolean, pixelsPerVoxelHere: number, extent: number): boolean {
  return below(pixelsPerVoxelHere, HIDDEN_PIXELS / Math.max(extent, 1e-6), wasHidden);
}

// No hysteresis: a figure three pixels tall is gone or there with nothing to see either way.
export function standsOut(pixelsPerVoxelHere: number, extent: number): boolean {
  return pixelsPerVoxelHere * extent >= HIDDEN_PIXELS;
}

export function worthCoarsening(fullTriangles: number, coarseTriangles: number): boolean {
  return coarseTriangles > 0 && coarseTriangles <= fullTriangles * COARSE_TRIANGLE_SHARE;
}
