// One mesh, not one per chunk: the shadows are a few thousand triangles, and a draw
// call per chunk would cost more than culling could save.

import {
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  PlaneGeometry,
} from 'three/webgpu';
import { smoothstep, uniform, uv, vec3 } from 'three/tsl';
import type { SkyState } from '../../lighting/domain/dayNight';
import type { BlobShadow, ShadowCast } from '../domain/blobShadows';
import { castsDiffer, shadowCastFor, shadowQuadFor } from '../domain/blobShadows';
import { capacityFor } from '../domain/spatialChunks';

// Just above a path slab's two voxels, or a shadow is cut off at every kerb it crosses.
const BLOB_LIFT = 2.05;

// A hard-edged ellipse reads as a decal, so the core is small and the falloff long.
const BLOB_CORE = 0.15;

export interface BlobShadowField {
  readonly group: Group;
  readonly count: number;
  readonly drawCalls: number;
  readonly triangleCount: number;
  add(blob: BlobShadow): void;
  remove(key: string): boolean;
  applySky(state: SkyState): void;
  dispose(): void;
}

const scratch = new Matrix4();

// Built in XZ so an instance matrix is only a scale and an offset.
function blobGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(2, 2);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

interface BlobMaterial {
  readonly material: MeshBasicNodeMaterial;
  setStrength(strength: number): void;
}

function blobMaterial(): BlobMaterial {
  const strength = uniform(0);
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.colorNode = vec3(0, 0, 0);
  const edge = uv().sub(0.5).length().mul(2);
  material.opacityNode = smoothstep(BLOB_CORE, 1, edge).oneMinus().mul(strength);

  return {
    material,
    setStrength(next) {
      strength.value = next;
    },
  };
}

function createMesh(
  geometry: PlaneGeometry,
  material: MeshBasicNodeMaterial,
  capacity: number,
  count: number,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = 'blob-shadows';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = count;
  // Flat on the ground and never seen from below, so sorting against the opaque scene gains nothing.
  mesh.renderOrder = 1;
  return mesh;
}

export function buildBlobShadowField(blobs: readonly BlobShadow[]): BlobShadowField {
  const group = new Group();
  group.name = 'blob-shadows';

  const geometry = blobGeometry();
  const { material, setStrength } = blobMaterial();

  const cast: BlobShadow[] = [];
  const slots = new Map<string, number>();
  let dirtyLow = Number.POSITIVE_INFINITY;
  let dirtyHigh = Number.NEGATIVE_INFINITY;
  let sun: ShadowCast = { strength: 0, runX: 0, runZ: 0 };
  let mesh = createMesh(geometry, material, capacityFor(blobs.length), 0);
  group.add(mesh);

  function writeSlot(slot: number, blob: BlobShadow): void {
    const quad = shadowQuadFor(blob, sun);
    mesh.setMatrixAt(
      slot,
      scratch
        .makeScale(quad.halfWidth, 1, quad.halfDepth)
        .setPosition(quad.x, blob.y + BLOB_LIFT, quad.z),
    );
  }

  // The union of every slot written since the last whole upload: Three.js reads ranges
  // without consuming them, so replacing the range would drop an earlier write this frame.
  function markDirty(slot: number): void {
    dirtyLow = Math.min(dirtyLow, slot);
    dirtyHigh = Math.max(dirtyHigh, slot);
    const matrix = mesh.instanceMatrix;
    matrix.clearUpdateRanges();
    matrix.addUpdateRange(dirtyLow * 16, (dirtyHigh - dirtyLow + 1) * 16);
    matrix.needsUpdate = true;
  }

  function markClean(): void {
    dirtyLow = Number.POSITIVE_INFINITY;
    dirtyHigh = Number.NEGATIVE_INFINITY;
    mesh.instanceMatrix.clearUpdateRanges();
  }

  function grow(capacity: number): void {
    const previous = mesh;
    mesh = createMesh(geometry, material, capacity, cast.length);
    mesh.instanceMatrix.array.set(previous.instanceMatrix.array);
    group.remove(previous);
    previous.dispose();
    group.add(mesh);
    markClean();
  }

  function reshape(): void {
    for (let slot = 0; slot < cast.length; slot++) writeSlot(slot, cast[slot]!);
    markClean();
    mesh.instanceMatrix.needsUpdate = true;
    if (cast.length > 0) mesh.computeBoundingSphere();
  }

  cast.push(...blobs);
  for (const [slot, blob] of cast.entries()) slots.set(blob.key, slot);
  mesh.count = cast.length;
  reshape();

  return {
    group,
    get count() {
      return cast.length;
    },
    get drawCalls() {
      return cast.length > 0 ? 1 : 0;
    },
    get triangleCount() {
      return cast.length * 2;
    },
    add(blob) {
      const slot = cast.length;
      const capacity = capacityFor(slot + 1, mesh.instanceMatrix.count);
      if (capacity !== mesh.instanceMatrix.count) grow(capacity);
      cast.push(blob);
      slots.set(blob.key, slot);
      mesh.count = cast.length;
      writeSlot(slot, blob);
      markDirty(slot);
      // Without this the frustum test uses a stale sphere and culls the new shadow.
      mesh.computeBoundingSphere();
    },
    remove(key) {
      const slot = slots.get(key);
      if (slot === undefined) return false;
      const last = cast.length - 1;
      if (slot !== last) {
        // The last shadow moves into the hole: draw order carries no meaning.
        const moved = cast[last]!;
        cast[slot] = moved;
        slots.set(moved.key, slot);
        writeSlot(slot, moved);
        markDirty(slot);
      }
      cast.length = last;
      slots.delete(key);
      mesh.count = last;
      if (last > 0) mesh.computeBoundingSphere();
      return true;
    },
    applySky(state) {
      const next = shadowCastFor(state.sunDirection);
      setStrength(next.strength);
      if (!castsDiffer(next, sun)) return;
      sun = next;
      reshape();
    },
    dispose() {
      mesh.dispose();
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
