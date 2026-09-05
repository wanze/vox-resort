/**
 * Pure voxel-space arithmetic mirroring DVE's sector/section subdivision.
 *
 * DVE stores voxels in sectors, which are subdivided into cubic sections; the
 * mesher runs per section. These helpers work out which sectors have to exist
 * and which sections have to be meshed, without touching the engine.
 */

import type { VoxelWrite } from "./voxelWrites";

export interface VolumeSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VoxelOrigin {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SectionBucket {
  readonly origin: VoxelOrigin;
  readonly writes: readonly VoxelWrite[];
}

const floorDiv = (value: number, size: number): number => Math.floor(value / size);

const originKey = (origin: VoxelOrigin): string => `${origin.x}|${origin.y}|${origin.z}`;

function assertPositive(size: VolumeSize): void {
  if (size.x < 1 || size.y < 1 || size.z < 1) {
    throw new Error("Volume size must be positive on every axis");
  }
}

/** Snaps a voxel position down to the origin of the volume that contains it. */
export function originOf(position: VoxelOrigin, size: VolumeSize): VoxelOrigin {
  assertPositive(size);
  return {
    x: floorDiv(position.x, size.x) * size.x,
    y: floorDiv(position.y, size.y) * size.y,
    z: floorDiv(position.z, size.z) * size.z,
  };
}

/** Distinct volume origins touched by the given writes, in first-touch order. */
export function originsFor(
  writes: readonly VoxelWrite[],
  size: VolumeSize,
): readonly VoxelOrigin[] {
  const seen = new Set<string>();
  const origins: VoxelOrigin[] = [];
  for (const write of writes) {
    const origin = originOf(write, size);
    const key = originKey(origin);
    if (seen.has(key)) continue;
    seen.add(key);
    origins.push(origin);
  }
  return origins;
}

/** Groups writes by the section that owns them, so each section is loaded once. */
export function groupBySection(
  writes: readonly VoxelWrite[],
  sectionSize: VolumeSize,
): readonly SectionBucket[] {
  const buckets = new Map<string, { origin: VoxelOrigin; writes: VoxelWrite[] }>();
  for (const write of writes) {
    const origin = originOf(write, sectionSize);
    const key = originKey(origin);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { origin, writes: [] };
      buckets.set(key, bucket);
    }
    bucket.writes.push(write);
  }
  return [...buckets.values()];
}
