import { Vector3 } from 'three/webgpu';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { SceneHandle } from '../../rendering/adapters/threeScene';
import type { FrameUpdate } from './hudOverlay';
import { MAX_SIGNS, signsShown } from '../domain/signs';
import type { Anchor } from '../domain/staffPins';

const projected = new Vector3();

// z beyond 1 is behind the camera, or past its far plane.
const inViewport = (point: Vector3): boolean =>
  point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;

// Preallocated, and the same view handed to every frame: the overlay reads it in place. A NaN
// anchor projects to NaN, which is never in the viewport, so its button stays hidden.
export function createMarkerSpots(capacity: number) {
  const anchors = new Float32Array(capacity * 3);
  const view = { count: 0, spots: new Float32Array(capacity * 3) };
  const anchor = (index: number, point: Anchor): void => {
    anchors[index * 3] = point.x;
    anchors[index * 3 + 1] = point.y;
    anchors[index * 3 + 2] = point.z;
  };
  return {
    view: view as FrameUpdate['markers'],
    place(points: readonly Anchor[]): void {
      view.count = Math.min(points.length, capacity);
      for (let index = 0; index < view.count; index++) anchor(index, points[index]!);
    },
    anchor,
    showing(count: number): void {
      view.count = Math.min(count, capacity);
    },
    // In CSS pixels, which is what the overlay positions its buttons in.
    project(camera: SceneHandle['camera'], width: number, height: number): void {
      for (let index = 0; index < view.count; index++) {
        const at = index * 3;
        projected.set(anchors[at]!, anchors[at + 1]!, anchors[at + 2]!).project(camera);
        view.spots[at] = ((projected.x + 1) / 2) * width;
        view.spots[at + 1] = ((1 - projected.y) / 2) * height;
        view.spots[at + 2] = Number(inViewport(projected));
      }
    },
  };
}

// Both axes, as either one looks end on from some camera.
export function tilePxAt(
  camera: SceneHandle['camera'],
  at: Vector3,
  width: number,
  height: number,
) {
  projected.copy(at).project(camera);
  const x = projected.x;
  const y = projected.y;
  projected.set(at.x + TILE_VOXELS, at.y, at.z).project(camera);
  const alongX = Math.hypot((projected.x - x) * width, (projected.y - y) * height);
  projected.set(at.x, at.y, at.z + TILE_VOXELS).project(camera);
  const alongZ = Math.hypot((projected.x - x) * width, (projected.y - y) * height);
  return Math.max(alongX, alongZ) / 2;
}

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

// Measured at the camera's target rather than per sign, so the signs come and go together.
export function createSignSpots() {
  const spots = createMarkerSpots(MAX_SIGNS);
  let placed = 0;
  let shown = false;
  return {
    view: spots.view,
    place(points: readonly Anchor[]): void {
      spots.place(points);
      placed = spots.view.count;
    },
    project(camera: SceneHandle['camera'], target: Vector3, wanted: boolean, size: ViewSize) {
      const { width, height } = size;
      shown = wanted && placed > 0 && signsShown(tilePxAt(camera, target, width, height), shown);
      if (!shown) return spots.showing(0);
      spots.showing(placed);
      spots.project(camera, width, height);
    },
  };
}
