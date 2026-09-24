import type { Vector3 } from '../../lighting/domain/dayNight';

// Path slabs never cast past their own footprint, and there are thousands of them.
export const MIN_CAST_HEIGHT = 4;

// Capped: a blob with no silhouette streaking to the horizon at sunrise looks wrong.
export const MAX_CAST_LENGTH = 3;

export const BLOB_OPACITY = 0.42;

const FULL_SHADOW_ELEVATION = 0.25;

const BLOB_SPREAD = 1.05;

export interface ShadowCaster {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export interface BlobShadow {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  // The caster's own terrace rather than the ground it runs over: a simplification
  // nobody can see from the height the plot is viewed at.
  readonly y: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly height: number;
}

export function blobShadowFor(caster: ShadowCaster): BlobShadow | null {
  if (caster.height < MIN_CAST_HEIGHT) return null;
  return {
    key: caster.key,
    x: caster.x + caster.width / 2,
    z: caster.z + caster.depth / 2,
    y: caster.y,
    halfWidth: (caster.width / 2) * BLOB_SPREAD,
    halfDepth: (caster.depth / 2) * BLOB_SPREAD,
    height: caster.height,
  };
}

export function blobShadowsFor(casters: readonly ShadowCaster[]): BlobShadow[] {
  const blobs: BlobShadow[] = [];
  for (const caster of casters) {
    const blob = blobShadowFor(caster);
    if (blob) blobs.push(blob);
  }
  return blobs;
}

export interface ShadowCast {
  readonly strength: number;
  readonly runX: number;
  readonly runZ: number;
}

const NO_CAST: ShadowCast = { strength: 0, runX: 0, runZ: 0 };

export function shadowCastFor(sunDirection: Vector3): ShadowCast {
  const elevation = sunDirection.y;
  if (elevation <= 0) return NO_CAST;

  const strength = BLOB_OPACITY * Math.min(1, elevation / FULL_SHADOW_ELEVATION);
  const horizontal = Math.hypot(sunDirection.x, sunDirection.z);
  if (horizontal <= 0) return { strength, runX: 0, runZ: 0 };

  const run = Math.min(MAX_CAST_LENGTH, horizontal / elevation);
  return {
    strength,
    runX: (-sunDirection.x / horizontal) * run,
    runZ: (-sunDirection.z / horizontal) * run,
  };
}

export interface ShadowQuad {
  readonly x: number;
  readonly z: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
}

// Half the sweep shifts and half grows, so the blob runs out of the object and the
// half under it is hidden. Nothing is drawn under objects: every model already
// paints a ground plate over its whole footprint.
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

export function castsDiffer(a: ShadowCast, b: ShadowCast): boolean {
  const epsilon = 1e-4;
  return (
    Math.abs(a.strength - b.strength) > epsilon ||
    Math.abs(a.runX - b.runX) > epsilon ||
    Math.abs(a.runZ - b.runZ) > epsilon
  );
}
