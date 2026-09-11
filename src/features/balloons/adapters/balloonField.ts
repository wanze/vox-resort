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

import { Group } from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import {
  disposeFieldMeshes,
  fieldMaterials,
  fieldMeshesFor,
  fieldTriangles,
  slotsFor,
  type FieldMesh,
} from '../../rendering/adapters/movingField';
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

/**
 * Writes one mesh's worth of instances.
 *
 * A uniform scale and a translation, written as the seven numbers that are not
 * zero: a balloon has no heading to face, so there is no rotation to build and
 * nothing a `Matrix4` would do for the cost of allocating one. The buffer goes
 * up whole and without update ranges, because everything moved.
 */
function writeInstances(part: FieldMesh, balloons: Balloons): void {
  const matrices = part.mesh.instanceMatrix.array;
  for (let slot = 0; slot < part.members.length; slot++) {
    const pose = poseOf(balloons, part.members[slot]!);
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

  const { lit, glow, dispose: disposeMaterials } = fieldMaterials(options.lightVolume ?? null);

  // Two meshes per model: the glowing envelope, and the basket that hangs under
  // it in the resort's own light. That is what makes a balloon read as lit from
  // the inside rather than as a painted shape.
  const parts = models.flatMap((model, variant) =>
    fieldMeshesFor({
      name: `balloon-${model.id}`,
      members: slotsFor(balloons.variant, balloons.count, variant),
      surfaces: [
        { kind: 'glow', source: model.emissive, material: glow },
        { kind: 'lit', source: model.lit, material: lit },
      ],
    }),
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
    triangleCount: fieldTriangles(parts),
    advance(dt, readiness) {
      const step = Math.min(Math.max(dt, 0), MAX_STEP);
      if (step === 0) return;
      stepBalloons(balloons, step, readiness, sites);
      for (const part of parts) writeInstances(part, balloons);
    },
    dispose() {
      disposeFieldMeshes(parts);
      group.clear();
      disposeMaterials();
    },
  };
}
