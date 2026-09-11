/**
 * The balloons on screen: one `InstancedMesh` per balloon model and surface,
 * rewritten every frame.
 *
 * `domain/balloons.ts` decides who is holding one and how far it has climbed;
 * this puts them in the sky. It is the crowd field's shape — see
 * `crowd/adapters/crowdField.ts` — for the crowd field's reasons: a field of
 * instances that all move every frame is a field with nothing to cull, so the
 * buckets, the chunks and the bounding spheres that make a *static* object cheap
 * would all be paid for and none of them would pay back. `frustumCulled` is off
 * for the same reason it is off there.
 *
 * Two things differ, and both come from a balloon being a lantern rather than a
 * person.
 *
 * **It is scaled, not just moved.** A balloon grows as it is lit and dwindles as
 * it climbs out of the frame, which is the field's stand-in for a fade: the glow
 * material is opaque, and a transparent pass over a few dozen quads would cost
 * more sorting than the whole feature is worth. A balloon on the sand is scaled
 * to nothing, so a waiting one keeps its instance slot and draws no pixels.
 *
 * **Most of it does not want the light.** The envelope is emissive — see
 * `voxel-gen/sky/lantern.ts` for why a lit paper lantern has no shaded side —
 * so it is drawn with a flat unlit material, and only the basket under it goes
 * through the resort's own lit one. That is two draws per model rather than one,
 * and it is what makes the balloon read as lit from the inside.
 *
 * Balloons are not `Placement`s and reach neither bake, for the reason people do
 * not: the lamp and sky-visibility volumes are static by construction, and a
 * thing that crosses seventy metres of sky in a minute would rebuild them every
 * frame. A balloon lights nothing on the ground. It is a hundred metres up.
 */

import {
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshBasicNodeMaterial,
  type BufferGeometry,
  type Material,
} from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { litMaterial } from '../../rendering/adapters/instancedWorld';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { poseOf, stepBalloons, type Balloons, type ReleaseSite } from '../domain/balloons';

/**
 * The longest step the flight will take, in seconds.
 *
 * A backgrounded tab reports the time it was away as one frame; without a clamp
 * the whole sky would jump. The crowd clamps its own step for the same reason
 * and to the same tenth of a second — written again rather than shared, because
 * borrowing a constant from the crowd would be a balloon that depended on how
 * fast somebody walks.
 */
const MAX_STEP = 0.1;

export interface BalloonField {
  readonly group: Group;
  /** Balloons the beach has, in the air and on the sand together. */
  readonly count: number;
  /** Draw calls this costs: two per balloon model that has anybody in it. */
  readonly drawCalls: number;
  /** Triangles it submits per frame, waiting balloons included. */
  readonly triangleCount: number;
  /**
   * Steps the sky by a frame's worth of seconds and writes where everything
   * ended up. `readiness` is how freely the beach is letting them go right now;
   * see `releaseStrength` in the domain module.
   */
  advance(dt: number, readiness: number): void;
  dispose(): void;
}

export interface BalloonFieldOptions {
  readonly balloons: Balloons;
  /** Spots on the sand they are let go from. */
  readonly sites: readonly ReleaseSite[];
  /**
   * One geometry per balloon model, in the order the sky registry declares them
   * — a balloon's `variant` is an index into this.
   */
  readonly models: readonly ModelGeometry[];
  /** The lamps the basket hangs in; without it, it is lit by the sky alone. */
  readonly lightVolume?: BakedLightVolume | null;
}

/** One balloon model's geometry of one kind, and who is drawn in each slot. */
interface BalloonMesh {
  readonly mesh: InstancedMesh;
  /** This field's own copy; see {@link flownGeometry}. */
  readonly geometry: BufferGeometry;
  /** Balloon index drawn in each instance slot, in slot order. */
  readonly balloons: Int32Array;
  /** Triangles in a single balloon of this geometry. */
  readonly triangles: number;
}

/**
 * A balloon model's geometry, hung on its own middle.
 *
 * Cloned rather than used as it stands, for the reason the crowd clones its
 * figures: the geometries belong to the meshed catalogue, which is built once at
 * load and outlives every resort, and this translation must not be applied to
 * them twice. Centred across and along and on the foot of the basket, so the
 * matrix carries where the balloon *is* rather than where the corner of its
 * bounding box is — which is what lets the scale in that matrix grow it about
 * itself instead of dragging it sideways.
 */
function flownGeometry(source: BufferGeometry): BufferGeometry {
  const geometry = source.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  return geometry;
}

/** Allocates one mesh for one model's geometry of one kind. */
function buildBalloonMesh(parts: {
  readonly source: BufferGeometry;
  readonly material: Material;
  readonly name: string;
  readonly balloons: Int32Array;
}): BalloonMesh {
  const geometry = flownGeometry(parts.source);
  const mesh = new InstancedMesh(geometry, parts.material, parts.balloons.length);
  mesh.name = parts.name;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Every instance moves every frame; see the note at the top of the file.
  mesh.frustumCulled = false;
  return {
    mesh,
    geometry,
    balloons: parts.balloons,
    triangles: (geometry.getIndex()?.count ?? 0) / 3,
  };
}

/** Which balloons are drawn in one model, as the slots of its own meshes. */
function slotsFor(balloons: Balloons, variant: number): Int32Array {
  const mine: number[] = [];
  for (let index = 0; index < balloons.count; index++) {
    if (balloons.variant[index] === variant) mine.push(index);
  }
  return Int32Array.from(mine);
}

/**
 * The meshes one balloon model needs: its glowing envelope, and the basket that
 * hangs under it in the resort's own light.
 *
 * Nothing at all for a model nobody is drawn in, and nothing for a surface the
 * model does not have — a balloon with no basket would simply be a glow.
 */
function meshesFor(parts: {
  readonly model: ModelGeometry;
  readonly slots: Int32Array;
  readonly glow: Material;
  readonly lit: Material;
}): BalloonMesh[] {
  if (parts.slots.length === 0) return [];
  return [
    { kind: 'glow', source: parts.model.emissive, material: parts.glow },
    { kind: 'lit', source: parts.model.lit, material: parts.lit },
  ]
    .filter((surface) => surface.source !== null)
    .map((surface) =>
      buildBalloonMesh({
        source: surface.source!,
        material: surface.material,
        name: `balloon-${parts.model.id}-${surface.kind}`,
        balloons: parts.slots,
      }),
    );
}

/**
 * Writes one mesh's worth of instances.
 *
 * A uniform scale and a translation, written as the seven numbers that are not
 * zero: a balloon has no heading to face, so there is no rotation to build and
 * nothing a `Matrix4` would do for the cost of allocating one. The buffer goes
 * up whole and without update ranges, because everything moved.
 */
function writeInstances(part: BalloonMesh, balloons: Balloons): void {
  const matrices = part.mesh.instanceMatrix.array;
  for (let slot = 0; slot < part.balloons.length; slot++) {
    const pose = poseOf(balloons, part.balloons[slot]!);
    const at = slot * 16;
    matrices[at] = pose.scale;
    matrices[at + 5] = pose.scale;
    matrices[at + 10] = pose.scale;
    matrices[at + 12] = pose.x;
    matrices[at + 13] = pose.y;
    matrices[at + 14] = pose.z;
    matrices[at + 15] = 1;
  }
  part.mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Puts a beach's balloons in the sky.
 *
 * A plot with no sand has no balloons and comes back as an empty group, which
 * costs a call to {@link advance} that does nothing. That is a resort without a
 * beach, not a mistake.
 */
export function buildBalloonField(options: BalloonFieldOptions): BalloonField {
  const { balloons, models, sites } = options;
  const group = new Group();
  group.name = 'balloons';

  const lit = litMaterial(options.lightVolume ?? null);
  // Unlit, exactly as the resort's own glowing surfaces are: the vertex colour
  // goes straight to the screen, which is what a lit paper envelope wants.
  const glow = new MeshBasicNodeMaterial({ vertexColors: true });

  const parts = models.flatMap((model, variant) =>
    meshesFor({ model, slots: slotsFor(balloons, variant), glow, lit }),
  );
  for (const part of parts) {
    group.add(part.mesh);
    writeInstances(part, balloons);
  }

  return {
    group,
    get count() {
      return balloons.count;
    },
    drawCalls: parts.length,
    triangleCount: parts.reduce((total, part) => total + part.triangles * part.balloons.length, 0),
    advance(dt, readiness) {
      const step = Math.min(Math.max(dt, 0), MAX_STEP);
      if (step === 0) return;
      stepBalloons(balloons, step, readiness, sites);
      for (const part of parts) writeInstances(part, balloons);
    },
    dispose() {
      for (const part of parts) {
        part.mesh.dispose();
        // This field's own clone, unlike the geometry it was taken from: that
        // one belongs to the meshed catalogue and outlives every resort.
        part.geometry.dispose();
      }
      group.clear();
      lit.dispose();
      glow.dispose();
    },
  };
}
