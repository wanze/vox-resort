/**
 * The people in the bay's boats: one `InstancedMesh` per person model, rewritten
 * every frame off the hulls they are sitting in.
 *
 * `domain/passengers.ts` decides who is aboard which craft and where a berth
 * puts them; this draws them. It is a figure field, so the geometry and the
 * whole of the seated pose come from `rendering/adapters/figureField.ts` and are
 * shared with the crowd: a passenger is a person on a bench, on a bench that
 * moves. What is left here is the matrix.
 *
 * **Built by the sea field rather than by the scene**, and that is the one piece
 * of wiring worth explaining. A passenger's position is a function of a hull's
 * pose *this frame*, so it has to be written after the flotilla is stepped and
 * before the frame is drawn. `seaField.ts` is what steps it, so a caller holding
 * both halves is a caller who can write the passengers off last frame's bay. The
 * crowd field owns `stepCrowd` for exactly the same reason.
 *
 * **The draw shortens when the berths fill.** A hire pedalo lying outside the
 * hut carries nobody, so its guest must be undrawn, and the two obvious ways do
 * not work here: a zero scale would leave the seated fold behind as a cross of
 * stray voxels, because `positionNode` displaces a vertex *after* the instance
 * matrix and is not scaled by it; and the crowd's `resting` float says which of
 * three poses somebody is in, not whether they exist. So the slots are compacted
 * instead. Whoever is aboard is written into the front of the buffer and
 * `InstancedMesh.count` is cut to however many that was. On a couple of dozen
 * rows that is the same loop with a `continue` in it, and it is the reason this
 * is not rows of `Crowd`: six hundred people should not be compacted per frame.
 *
 * **A full attitude per instance**, for the reason `seaField.ts` writes one: a
 * figure in a boat heels and pitches with the boat, and the berth's own turn
 * sits inside that so a rower facing astern still heels the way the hull does.
 * Three rotations is a matrix worth composing properly, and at a couple of dozen
 * instances the compose is nothing.
 *
 * Nothing here is a `Placement` and nothing here reaches either bake, for the
 * reason the boats do not: both volumes are static by construction and a person
 * crossing the bay would rebuild them every frame. The light still lands on
 * them, because the lit material samples the volume wherever the matrix put it.
 */

import {
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedBufferAttribute,
  type Material,
} from 'three/webgpu';
import { RESTING } from '../../crowd/domain/crowd';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import {
  figureGeometry,
  figureMaterial,
  POSE_COS,
  POSE_RESTING,
  POSE_SIN,
  POSE_STRIDE,
} from '../../rendering/adapters/figureField';
import { disposeFieldMeshes, slotsFor, type FieldMesh } from '../../rendering/adapters/movingField';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import type { Flotilla } from '../domain/flotilla';
import { aboard, poseAboard, type Passengers } from '../domain/passengers';

export interface CrewField {
  readonly group: Group;
  /** People aboard right now, which is exactly who is being drawn. */
  readonly count: number;
  /**
   * Draw calls this costs: one per person model somebody afloat is drawn in
   * *right now*.
   *
   * Read on demand for the reason {@link triangleCount} is, and it is the same
   * reason: a mesh whose whole crew is ashore has its count cut to nought, and
   * `RenderObject` skips a zero-instance draw outright. A count of the meshes
   * would stop matching what the renderer reports back.
   */
  readonly drawCalls: number;
  /** Triangles it submits per frame, which falls as the hire boats tie up. */
  readonly triangleCount: number;
  /**
   * Writes where everybody aboard ended up, off the bay as it stands.
   *
   * Called by the sea field once it has stepped the flotilla; there is nothing
   * of its own to step. See the note at the top of the file.
   */
  write(): void;
  dispose(): void;
}

export interface CrewFieldOptions {
  readonly flotilla: Flotilla;
  /** Who is aboard what, which this then draws and does not change. */
  readonly passengers: Passengers;
  /**
   * One geometry per person model, in the order the people registry declares
   * them: a passenger's `variant` is an index into this.
   */
  readonly models: readonly ModelGeometry[];
  /** The lamps the bay lies under, so a passenger catches what a hull does. */
  readonly lightVolume?: BakedLightVolume | null;
}

/**
 * One person model, its mesh, and which passengers it may draw.
 *
 * A {@link FieldMesh} with two things added, which is what makes it a figure
 * field rather than a moving one: the direction attribute the seated pose is
 * folded along, and how many of its slots were written this frame. `members` is
 * therefore who *may* be drawn in it rather than who is, which is the one place
 * this parts company with `movingField.ts`.
 */
interface CrewMesh extends FieldMesh {
  readonly mesh: InstancedMesh;
  readonly geometry: BufferGeometry;
  /**
   * Which way each drawn figure faces, as `(sin, cos)` in the first two floats
   * of each slot's pose: the direction their legs point. Written per slot rather
   * than per passenger, because the slots move. See `POSE_STRIDE`.
   */
  readonly pose: InstancedBufferAttribute;
  /** Figures written into this mesh's slots this frame; what the draw is cut to. */
  drawn: number;
}

/** One attitude, built once and refilled per instance; see the header. */
const attitude = new Matrix4();
const hull = new Euler(0, 0, 0, 'YXZ');
const spin = new Quaternion();
const inBoat = new Quaternion();
const at = new Vector3();
const UP = new Vector3(0, 1, 0);
const UNSCALED = new Vector3(1, 1, 1);

/**
 * Writes one mesh's worth of instances, skipping whoever is not aboard.
 *
 * The attitude is the hull's, turned again by the berth's own facing *inside*
 * it: yaw, then pitch and roll about the hull's axes, then the turn that puts
 * somebody the other way round on the thwart. Composed in that order rather
 * than by adding the two yaws, because the heel and the trim belong to the boat
 * and would come out mirrored on a figure facing astern.
 *
 * The buffers go up whole and without update ranges, because everybody moved:
 * every hull is riding the swell. The pose's `resting` float is not touched at
 * all, which is the one number this field can write once: every slot holds
 * somebody sitting, whoever that turns out to be.
 */
function writeInstances(part: CrewMesh, flotilla: Flotilla, passengers: Passengers): void {
  const matrices = part.mesh.instanceMatrix.array;
  const packed = part.pose.array;
  let slot = 0;
  for (const person of part.members) {
    if (!aboard(flotilla, passengers, person)) continue;
    const pose = poseAboard(flotilla, passengers, person);
    hull.set(pose.pitch, pose.bow, pose.roll);
    spin.setFromEuler(hull);
    inBoat.setFromAxisAngle(UP, pose.heading - pose.bow);
    spin.multiply(inBoat);
    at.set(pose.x, pose.y, pose.z);
    attitude.compose(at, spin, UNSCALED);
    attitude.toArray(matrices, slot * 16);
    packed[slot * POSE_STRIDE + POSE_SIN] = Math.sin(pose.heading);
    packed[slot * POSE_STRIDE + POSE_COS] = Math.cos(pose.heading);
    slot++;
  }
  part.drawn = slot;
  part.mesh.count = slot;
  part.mesh.instanceMatrix.needsUpdate = true;
  part.pose.needsUpdate = true;
}

/**
 * Allocates the mesh for one person model and says which passengers it may
 * draw, or nothing at all for a model nobody afloat is drawn in.
 *
 * The buffer is the size of everybody who could ever be drawn in this model,
 * not of however many of them are aboard at the moment: the passenger list is
 * fixed once the bay is built, and only the *draw* shortens. See
 * {@link writeInstances}.
 */
function buildCrewMesh(
  model: ModelGeometry,
  material: Material,
  passengers: Passengers,
  variant: number,
): CrewMesh | null {
  const members = slotsFor(passengers.variant, passengers.count, variant);
  if (members.length === 0) return null;

  const geometry = figureGeometry(model, members.length);
  // Every slot of this mesh holds a seated figure whoever fills it, so the pose
  // buffer is filled here and never written again. See {@link writeInstances}.
  const pose = geometry.getAttribute('pose') as InstancedBufferAttribute;
  for (let slot = 0; slot < members.length; slot++) {
    pose.array[slot * POSE_STRIDE + POSE_RESTING] = RESTING.sitting;
  }

  const mesh = new InstancedMesh(geometry, material, members.length);
  mesh.name = `sea-crew-${model.id}`;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Every instance moves every frame, so a bounding sphere would have to be
  // recomputed every frame to cull against. See `movingField.ts`.
  mesh.frustumCulled = false;
  return {
    mesh,
    geometry,
    members,
    triangles: (geometry.getIndex()?.count ?? 0) / 3,
    pose,
    drawn: 0,
  };
}

/** Figures written into a field's slots this frame, across its meshes. */
const drawnIn = (parts: readonly CrewMesh[]): number =>
  parts.reduce((total, part) => total + part.drawn, 0);

/** Meshes with anybody in them, which is what the renderer will actually draw. */
const drawingIn = (parts: readonly CrewMesh[]): number =>
  parts.reduce((total, part) => total + Math.min(part.drawn, 1), 0);

/**
 * Puts the bay's passengers in its boats.
 *
 * A bay with nothing crewed on it comes back as an empty group, which costs a
 * call to {@link write} that does nothing. That is a resort inland, or a
 * registry whose craft declare no seats, rather than a mistake.
 */
export function buildCrewField(options: CrewFieldOptions): CrewField {
  const { flotilla, passengers, models } = options;
  const group = new Group();
  group.name = 'sea-crew';

  const figure = figureMaterial(options.lightVolume ?? null);
  const parts: CrewMesh[] = [];
  for (const [variant, model] of models.entries()) {
    const part = buildCrewMesh(model, figure.material, passengers, variant);
    if (!part) continue;
    parts.push(part);
    group.add(part.mesh);
    writeInstances(part, flotilla, passengers);
  }

  return {
    group,
    get count() {
      return drawnIn(parts);
    },
    get drawCalls() {
      return drawingIn(parts);
    },
    get triangleCount() {
      return parts.reduce((total, part) => total + part.triangles * part.drawn, 0);
    },
    write() {
      for (const part of parts) writeInstances(part, flotilla, passengers);
    },
    dispose() {
      disposeFieldMeshes(parts);
      group.clear();
      figure.material.dispose();
    },
  };
}
