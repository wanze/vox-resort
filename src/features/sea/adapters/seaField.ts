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
 * **The passengers are drawn from here too**, and they are not a third thing
 * this file knows how to write. They are a figure field of their own in
 * `crewField.ts`, built and stepped by this one for a reason that is about the
 * frame and not about tidiness: a passenger's position is a function of a hull's
 * pose *this* frame, so it has to be written between the step below and the
 * draw. Handing a caller both halves is handing them the chance to seat
 * everybody in last frame's boats.
 *
 * Nothing here is a `Placement` and nothing here reaches either bake, for the
 * reason people and balloons do not: the lamp and sky-visibility volumes are
 * static by construction, and a fleet that crosses the bay would rebuild them
 * every frame. The one exception is a buoy's lamp, which does light the water:
 * a buoy never leaves its mooring, so the app bakes its lamp there before the
 * field is built. See `domain/buoyLamps.ts`.
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
import type { Passengers } from '../domain/passengers';
import type { SailingGround } from '../domain/swimArea';
import { buildCrewField } from './crewField';

export interface SeaField {
  readonly group: Group;
  /** Everything afloat: the buoys and the craft together. */
  readonly count: number;
  /** People sitting in the boats right now. */
  readonly crewCount: number;
  /**
   * Draw calls this costs: one per surface of each model anybody is drawn in,
   * and one more per person model somebody afloat is drawn in right now.
   *
   * Read on demand for the reason {@link triangleCount} is: the crew's half of
   * it falls to nothing while the hire boats are tied up. See `crewField.ts`.
   */
  readonly drawCalls: number;
  /**
   * Triangles it submits per frame, the passengers included.
   *
   * Read on demand rather than worked out once, because the crew's half of it
   * moves: a hire boat lying at its berth carries nobody, so the figures drawn
   * rise and fall with the hire trade. See `crewField.ts`.
   */
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
  /**
   * The people to sit in the boats, and the models to draw them in.
   *
   * Not optional, because "nobody is afloat" is already what an empty passenger
   * list means and a second way of saying it would be a second branch in every
   * line below that reads the crew. A resort inland has no craft, so it has no
   * passengers, and the field it gets is an empty group.
   *
   * Passed alongside the flotilla rather than derived from it for the reason the
   * craft's own variants are: the registries are read by the caller that reads
   * registries. See `domain/passengers.ts`.
   */
  readonly crew: SeaCrewOptions;
  /** The lamps the bay lies under; without it, it is lit by the sky alone. */
  readonly lightVolume?: BakedLightVolume | null;
}

/** Who is aboard the bay's craft, and the art they are drawn from. */
export interface SeaCrewOptions {
  readonly passengers: Passengers;
  /**
   * One geometry per person model, in the order the people registry declares
   * them: a passenger's `variant` is an index into this.
   */
  readonly models: readonly ModelGeometry[];
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

  const crew = buildCrewField({
    flotilla,
    passengers: options.crew.passengers,
    models: options.crew.models,
    lightVolume: options.lightVolume ?? null,
  });
  group.add(crew.group);

  const hulls = fieldTriangles(parts);
  return {
    group,
    get count() {
      return flotilla.count;
    },
    get crewCount() {
      return crew.count;
    },
    get drawCalls() {
      return parts.length + crew.drawCalls;
    },
    get triangleCount() {
      return hulls + crew.triangleCount;
    },
    advance(dt) {
      const step = Math.min(Math.max(dt, 0), MAX_STEP);
      if (step === 0) return;
      stepFlotilla(flotilla, step, ground);
      for (const part of parts) writeInstances(part, flotilla);
      // After the hulls and off the same poses: a passenger sits in the boat as
      // it is now, not as it was last frame. See the note at the top.
      crew.write();
    },
    dispose() {
      crew.dispose();
      disposeFieldMeshes(parts);
      group.clear();
      disposeMaterials();
    },
  };
}
