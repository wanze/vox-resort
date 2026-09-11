/**
 * The bay on screen: one `InstancedMesh` per sea model and surface, rewritten
 * every frame.
 *
 * `domain/flotilla.ts` decides where every boat and buoy is and how it is riding
 * the swell; this puts them on the water. It is the balloon field's shape — see
 * `balloons/adapters/balloonField.ts` — for the crowd field's reasons: a field
 * of instances that all move every frame is a field with nothing to cull, so the
 * buckets, the chunks and the bounding spheres that make a *static* object cheap
 * would all be paid for and none of them would pay back. `frustumCulled` is off
 * for the same reason it is off there.
 *
 * Two things differ from the balloons, and both come from a boat being on the
 * water rather than in the air.
 *
 * **It is a full attitude, not a translation.** A balloon has no front, so its
 * matrix is seven numbers written by hand. A hull has a bow, and it heels and
 * pitches on the swell — three rotations, which is a matrix worth composing
 * properly. At a few dozen instances the compose is nothing; at six hundred it
 * would be the crowd, which is exactly why the crowd writes a yaw by hand.
 *
 * **It floats at the waterline, and that is what the shared geometry hang
 * already gives it.** Every model in the sea registry is drawn from its own
 * waterline up — see `voxel-gen/parts/boat.ts` — so `hungGeometry`, which
 * centres a model and drops it onto the foot of its box, puts the matrix's
 * position exactly where the sea surface cuts the hull. That is what lets the
 * swell lift a boat by writing one number, and what makes the roll heel it about
 * its own keel.
 *
 * Nothing here is a `Placement` and nothing here reaches either bake, for the
 * reason people and balloons do not: the lamp and sky-visibility volumes are
 * static by construction, and a fleet that crosses the bay would rebuild them
 * every frame. A buoy's lamp glows; it lights no water.
 */

import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
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
import { MAX_STEP, poseOf, stepFlotilla, type Flotilla } from '../domain/flotilla';
import type { SailingGround } from '../domain/swimArea';

export interface SeaField {
  readonly group: Group;
  /** Everything afloat: the buoys and the craft together. */
  readonly count: number;
  /** Draw calls this costs: one per surface of each model anybody is drawn in. */
  readonly drawCalls: number;
  /** Triangles it submits per frame. */
  readonly triangleCount: number;
  /** Steps the bay by a frame's worth of seconds and writes where it ended up. */
  advance(dt: number): void;
  dispose(): void;
}

export interface SeaFieldOptions {
  readonly flotilla: Flotilla;
  /** The water the craft keep to; the same ground the fleet was created on. */
  readonly ground: SailingGround;
  /**
   * One geometry per sea model, in the order the sea registry declares them —
   * a craft's `variant` is an index into this.
   */
  readonly models: readonly ModelGeometry[];
  /** The lamps the bay lies under; without it, it is lit by the sky alone. */
  readonly lightVolume?: BakedLightVolume | null;
}

/** One matrix, built once and refilled per instance; see the header. */
const attitude = new Matrix4();
const turned = new Euler(0, 0, 0, 'YXZ');
const spin = new Quaternion();
const at = new Vector3();
const UNSCALED = new Vector3(1, 1, 1);

/**
 * Writes one mesh's worth of instances.
 *
 * The buffer goes up whole and without update ranges, because everything moved:
 * even a moored buoy is riding the swell.
 */
function writeInstances(part: FieldMesh, flotilla: Flotilla): void {
  const matrices = part.mesh.instanceMatrix.array;
  for (let slot = 0; slot < part.members.length; slot++) {
    const pose = poseOf(flotilla, part.members[slot]!);
    // Yaw first, then pitch and roll about the hull's own axes, which is what
    // `YXZ` means and what a boat on a swell actually does.
    turned.set(pose.pitch, pose.heading, pose.roll);
    spin.setFromEuler(turned);
    at.set(pose.x, pose.y, pose.z);
    attitude.compose(at, spin, UNSCALED);
    attitude.toArray(matrices, slot * 16);
  }
  part.mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Puts a bay's boats and buoys on the water.
 *
 * A plot with no sea has neither and comes back as an empty group, which costs a
 * call to {@link advance} that does nothing. That is a resort inland, not a
 * mistake.
 */
export function buildSeaField(options: SeaFieldOptions): SeaField {
  const { flotilla, models, ground } = options;
  const group = new Group();
  group.name = 'sea';

  const { lit, glow, dispose: disposeMaterials } = fieldMaterials(options.lightVolume ?? null);

  // A hull in the resort's own light, and a lamp for the one model that carries
  // one: a buoy is a navigation mark, so it burns after dark.
  const parts = models.flatMap((model, variant) =>
    fieldMeshesFor({
      name: `sea-${model.id}`,
      members: slotsFor(flotilla.variant, flotilla.count, variant),
      surfaces: [
        { kind: 'lit', source: model.lit, material: lit },
        { kind: 'glow', source: model.emissive, material: glow },
      ],
    }),
  );
  for (const part of parts) {
    group.add(part.mesh);
    writeInstances(part, flotilla);
  }

  return {
    group,
    get count() {
      return flotilla.count;
    },
    drawCalls: parts.length,
    triangleCount: fieldTriangles(parts),
    advance(dt) {
      const step = Math.min(Math.max(dt, 0), MAX_STEP);
      if (step === 0) return;
      stepFlotilla(flotilla, step, ground);
      for (const part of parts) writeInstances(part, flotilla);
    },
    dispose() {
      disposeFieldMeshes(parts);
      group.clear();
      disposeMaterials();
    },
  };
}
