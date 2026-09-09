/**
 * The cast shadows, as one instanced quad per object that throws one.
 *
 * `domain/blobShadows.ts` decides which objects those are and what shape each
 * one's shadow takes at a given hour; this puts them on the ground.
 *
 * **One mesh, not one per chunk.** Everything else in the scene is bucketed by
 * chunk so the renderer has something to cull — see `domain/spatialChunks.ts` —
 * and the same reasoning does not apply here. A shadow is two triangles, so the
 * whole plot's worth is a few thousand of them against the two million the
 * resort already submits, and splitting that into a draw call per chunk would
 * cost more in draws than it could ever save in triangles. What it costs instead
 * is fill: translucent quads lying on the ground, which is a page of blended
 * pixels at eye level and a thin smear from above.
 *
 * **Moving the sun rewrites every quad.** A shadow's shape depends on the height
 * casting it as well as on the sun, so it cannot be a uniform the way the lamp
 * factor is: each quad grows and shifts by its own caster's height. That is one
 * matrix write per shadow whenever the sun moves — a few thousand, well under a
 * millisecond, and only on a sky change rather than on a frame. A clock that is
 * not running pays nothing, which is what {@link castsDiffer} is for.
 *
 * They are drawn without writing depth, so shadows overlapping each other blend
 * rather than fight, and they lie just above the paving rather than just above
 * the grass: paths stand two voxels proud of the ground, and a shadow at ground
 * level would be cut off at every kerb it crossed on a plot that is a quarter
 * paved. The price is that a shadow floats half a metre over bare grass, which
 * is nothing from above and slight at eye level.
 */

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

/**
 * How high above the ground plane a shadow is drawn, in voxels.
 *
 * Just clear of a path slab's two voxels — see the note above on why they lie at
 * paving level rather than at ground level.
 */
const BLOB_LIFT = 2.05;

/**
 * Where a shadow stops being solid and starts fading, as a fraction of its own
 * half-extent.
 *
 * A hard-edged ellipse reads as a decal. The core is kept small and the falloff
 * long, which is roughly what a diffuse sky does to the edge of a shadow, and
 * generously more than that — which is the honest way to draw a shape that has
 * no silhouette in it.
 */
const BLOB_CORE = 0.15;

export interface BlobShadowField {
  readonly group: Group;
  /** Shadows standing on the plot. */
  readonly count: number;
  /** Draw calls this costs: one while anything casts, none when nothing does. */
  readonly drawCalls: number;
  /** Triangles it submits per frame. */
  readonly triangleCount: number;
  /** Adds one shadow, growing the buffer if it has run out of room. */
  add(blob: BlobShadow): void;
  /** Stretches and fades every shadow to a moment of the day. */
  applySky(state: SkyState): void;
  dispose(): void;
}

/** Scratch for a single matrix write; never escapes the call that uses it. */
const scratch = new Matrix4();

/**
 * A unit quad lying in the ground plane.
 *
 * Built in XZ rather than rotated per instance, so an instance matrix is a scale
 * and an offset and nothing else.
 */
function blobGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(2, 2);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** A material and the handle that fades it as the sun rises and sets. */
interface BlobMaterial {
  readonly material: MeshBasicNodeMaterial;
  setStrength(strength: number): void;
}

/**
 * One material for every shadow on the plot: flat black, soft-edged, and as dark
 * as the hour says.
 *
 * The shape is in the instance matrices; the only thing the shader needs to know
 * about the sun is how far to fade.
 */
function blobMaterial(): BlobMaterial {
  const strength = uniform(0);
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.colorNode = vec3(0, 0, 0);
  // Distance from the quad's centre, out to 1 at the edge of the inscribed disc.
  const edge = uv().sub(0.5).length().mul(2);
  material.opacityNode = smoothstep(BLOB_CORE, 1, edge).oneMinus().mul(strength);

  return {
    material,
    setStrength(next) {
      strength.value = next;
    },
  };
}

/** Allocates a mesh with room for `capacity` shadows, drawing the first `count`. */
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
  // Flat on the ground, and the camera is never under it, so nothing is gained
  // by sorting them against the opaque scene.
  mesh.renderOrder = 1;
  return mesh;
}

export function buildBlobShadowField(blobs: readonly BlobShadow[]): BlobShadowField {
  const group = new Group();
  group.name = 'blob-shadows';

  const geometry = blobGeometry();
  const { material, setStrength } = blobMaterial();

  const cast: BlobShadow[] = [];
  let sun: ShadowCast = { strength: 0, runX: 0, runZ: 0 };
  let mesh = createMesh(geometry, material, capacityFor(blobs.length), 0);
  group.add(mesh);

  function writeSlot(slot: number, blob: BlobShadow): void {
    const quad = shadowQuadFor(blob, sun);
    mesh.setMatrixAt(
      slot,
      scratch.makeScale(quad.halfWidth, 1, quad.halfDepth).setPosition(quad.x, BLOB_LIFT, quad.z),
    );
  }

  /** Swaps in a longer buffer, keeping what it already drew. */
  function grow(capacity: number): void {
    const previous = mesh;
    mesh = createMesh(geometry, material, capacity, cast.length);
    mesh.instanceMatrix.array.set(previous.instanceMatrix.array);
    group.remove(previous);
    previous.dispose();
    group.add(mesh);
  }

  /** Rewrites every quad, which is what a sun that has moved costs. */
  function reshape(): void {
    for (let slot = 0; slot < cast.length; slot++) writeSlot(slot, cast[slot]!);
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.needsUpdate = true;
    if (cast.length > 0) mesh.computeBoundingSphere();
  }

  cast.push(...blobs);
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
      mesh.count = cast.length;
      writeSlot(slot, blob);
      // One instance at a time, so the range is the one slot rather than the
      // union a bucket of the instanced world has to keep.
      const matrix = mesh.instanceMatrix;
      matrix.clearUpdateRanges();
      matrix.addUpdateRange(slot * 16, 16);
      matrix.needsUpdate = true;
      // Without this the frustum test reads a sphere that predates the shadow
      // and culls it out of a view it is plainly lying in.
      mesh.computeBoundingSphere();
    },
    applySky(state) {
      const next = shadowCastFor(state.sunDirection);
      setStrength(next.strength);
      // The shapes only move when the sun does, so a stopped clock costs nothing
      // however many frames it is stopped for.
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
