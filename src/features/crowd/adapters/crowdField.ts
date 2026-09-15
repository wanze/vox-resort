/**
 * The crowd on screen: one `InstancedMesh` per person model, rewritten every
 * frame.
 *
 * `domain/crowd.ts` decides where everybody is and `domain/walkNetwork.ts`
 * decides where they may go; this puts them on the plot. What is left here is a
 * matrix write per person per frame, and the deliberate absence of everything
 * else the scene does to a static object.
 *
 * **One mesh per model, and *not* chunked.** This inverts
 * `rendering/domain/spatialChunks.ts` on purpose. Chunking exists to give a
 * static mesh a bounding sphere the renderer can reject; a person crosses a
 * 64 m chunk every forty seconds, so a bucketed crowd would pay a remove, an add
 * and a bounding-sphere recompute per crossing, continuously, to save 30 k
 * triangles against the 2.18 M the resort already submits. `blobShadowField.ts`
 * settled the same trade from the other side. Four person models is four draw
 * calls, never culled — `frustumCulled` is off, because a sphere over instances
 * that all moved this frame is a sphere that would have to be recomputed this
 * frame, which is the cost this exists to avoid.
 *
 * **The walk is on the GPU.** The CPU writes a translation and a yaw, and the
 * yaw twice: once as the instance matrix and once as the direction vector it was
 * built from, which is what the shader swings a leg along. One `sin` in a
 * `positionNode` then swings six hundred pairs of legs out of step with each
 * other for no per-frame CPU at all, and the same node folds the sitters and the
 * loungers. None of that is here, because none of it is the crowd's: a figure
 * and its three poses are `rendering/adapters/figureField.ts`, which the bay's
 * passengers are drawn from too. What is here is where six hundred people are.
 *
 * **People are drawn, and nothing else.** They are not `Placement`s: nothing
 * here reaches `tileOccupancy`, `diffPlacements`, the label anchors, the blob
 * shadows or either bake. The last of those is the load-bearing one — the lamp
 * and sky-visibility volumes are static by construction and would have to be
 * rebuilt every frame for a crowd that walked through them. What people get for
 * free instead is the light: they are drawn with the ordinary lit material, so
 * `bakedLightVolume` samples the volume wherever the instance matrix put them,
 * and a crowd walks correctly through the pools of light the lamps cast at no
 * cost, because the fetch was already happening. See `docs/crowd.md`.
 */

import {
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  type BufferGeometry,
  type InstancedBufferAttribute,
  type MeshStandardNodeMaterial,
} from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import {
  figureGeometry,
  figureMaterial,
  POSE_COS,
  POSE_PHASE,
  POSE_RESTING,
  POSE_SIN,
  POSE_STRIDE,
} from '../../rendering/adapters/figureField';
import { pixelsPerVoxel, standsOut, type DetailView } from '../../rendering/domain/levelOfDetail';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { MAX_STEP, reseatCrowd, restingOn, stepCrowd, type Crowd } from '../domain/crowd';
import type { WalkNetwork } from '../domain/walkNetwork';

export interface CrowdField {
  readonly group: Group;
  /**
   * The crowd as it stands. A getter, because {@link relocate} rebinds it: a
   * caller holding a crowd of its own would be reading the one before the edit.
   */
  readonly crowd: Crowd;
  /** People being drawn. */
  readonly count: number;
  /** Draw calls this costs: one per person model somebody is walking in. */
  readonly drawCalls: number;
  /** Triangles it submits per frame, across everybody drawn. */
  readonly triangleCount: number;
  /**
   * Steps the crowd by a frame's worth of seconds, `scale` times over, and
   * writes where everybody ended up.
   *
   * One call rather than two because the walk cycle and the walk have to be
   * stepped by the *same* clamped, scaled `dt` — see {@link MAX_STEP} — and a
   * caller holding both halves of that is a caller who can get it wrong.
   *
   * `scale` is how many times faster than real time the crowd walks, which is
   * `sim/domain/crowdRate.ts`'s answer for the clock's speed. The frame is
   * clamped first and scaled after, so a backgrounded tab costs at most
   * `MAX_STEP` of real time at whatever the scale is.
   *
   * A frame of no time steps nobody and still writes: a paused resort has a
   * camera moving over it, and who is too small on screen to draw follows the
   * camera and not the clock.
   */
  advance(dt: number, scale: number): void;
  /**
   * The camera the next frames are drawn through, or null to draw everybody.
   * A person too small on screen to see is left out of the draw, not the walk.
   */
  setView(view: DetailView | null): void;
  /** People drawn on the last frame written. */
  readonly drawnCount: number;
  /**
   * Puts the same people on a graph that has been rebuilt underneath them,
   * after something was built or taken away. The meshes are untouched: who is
   * drawn in which of them is decided by `variant`, which a reseat never
   * changes. See `reseatCrowd`.
   */
  relocate(network: WalkNetwork): void;
  dispose(): void;
}

export interface CrowdFieldOptions {
  /** The crowd to draw, which this then owns the stepping of. */
  readonly crowd: Crowd;
  /**
   * One geometry per person model, in the order the people registry declares
   * them — a person's `variant` is an index into this.
   */
  readonly models: readonly ModelGeometry[];
  /** The lamps the crowd walks under; without it people are lit by the sky alone. */
  readonly lightVolume?: BakedLightVolume | null;
}

/** One person model, its mesh, and who is drawn in which slot of it. */
interface PersonMesh {
  readonly mesh: InstancedMesh;
  /** This field's own copy of the model's geometry; see {@link figureGeometry}. */
  readonly geometry: BufferGeometry;
  /** Person index drawn in each instance slot, in slot order. */
  readonly people: Int32Array;
  /** Triangles in a single figure of this model. */
  readonly triangles: number;
  /** How tall the figure stands, in voxels: what decides whether it can be seen. */
  readonly height: number;
  /**
   * Each drawn slot's heading, what they are doing and their walk phase, packed
   * as `figureGeometry` lays it out — see `POSE_STRIDE`.
   *
   * The heading is the same turn the instance matrix carries, in the form the
   * shader can use: see `figureMaterial` for why the matrix is no help to it. It
   * costs the two numbers the matrix write already worked out. All of it is per
   * slot rather than per person, and so rewritten with the rest: who is in which
   * slot changes as people come into and out of sight.
   */
  readonly pose: InstancedBufferAttribute;
}

/**
 * Allocates the mesh for one person model and says who it draws.
 *
 * The buffer is exactly the size of the crowd walking in this model: a crowd has
 * a fixed capacity — people are not built and taken down the way objects are, so
 * there is nothing here that could ever need to grow.
 */
function buildPersonMesh(
  model: ModelGeometry,
  material: MeshStandardNodeMaterial,
  crowd: Crowd,
  variant: number,
): PersonMesh | null {
  const people: number[] = [];
  for (let i = 0; i < crowd.count; i++) if (crowd.variant[i] === variant) people.push(i);
  if (people.length === 0) return null;

  const geometry = figureGeometry(model, people.length);
  const mesh = new InstancedMesh(geometry, material, people.length);
  mesh.name = `crowd-${model.id}`;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Every instance moves every frame, so a bounding sphere would have to be
  // recomputed every frame to cull against — which costs more than the four
  // draw calls it could save. See the note at the top of the file.
  mesh.frustumCulled = false;

  const matrices = mesh.instanceMatrix.array;
  for (let slot = 0; slot < people.length; slot++) {
    // The parts of the matrix a walking person never changes, written once: the
    // buffer is zero-filled, so this is the whole of the rest of it. The frame
    // loop then writes seven numbers per person rather than sixteen.
    matrices[slot * 16 + 5] = 1;
    matrices[slot * 16 + 15] = 1;
  }
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  return {
    mesh,
    geometry,
    people: Int32Array.from(people),
    triangles: (geometry.getIndex()?.count ?? 0) / 3,
    height: box.max.y - box.min.y,
    pose: geometry.getAttribute('pose') as InstancedBufferAttribute,
  };
}

/**
 * Writes one model's worth of instances, straight from the crowd's columns.
 *
 * The matrix is a yaw and a translation, so it is written as the seven numbers
 * that are not zero or one rather than built through a `Matrix4` and copied in.
 * Column-major, and the figure faces +z, so a turn of `heading` about Y is
 * exactly the heading `crowd.ts` computed with `atan2(dx, dz)` — which is also
 * why the `(sin, cos)` the turn is built from is worth keeping: it is the
 * direction the legs swing along, and it has already been paid for.
 *
 * Everybody the camera could make out is packed into the front of the buffers
 * and `count` is cut to them — the way the bay seats its passengers — so a
 * person a pixel tall costs a distance test and nothing else. Their phase goes
 * with them, since the slot they are drawn in changes as others come and go.
 *
 * Both buffers go up whole, without update ranges: everybody moved.
 * Returns how many were drawn.
 *
 * Only people below the crowd's `count` are drawn. The mesh was sized from the
 * crowd as it was built, and a reseat onto a plot with no paving left keeps
 * everybody's columns but walks nobody; see `reseatCrowd`. A mesh's people are
 * in person order, so the first one past the count ends the loop.
 */
function writeInstances(part: PersonMesh, crowd: Crowd, view: DetailView | null): number {
  const matrices = part.mesh.instanceMatrix.array;
  const pose = part.pose.array;
  const middle = part.height / 2;
  let slot = 0;
  for (let index = 0; index < part.people.length; index++) {
    const person = part.people[index]!;
    if (person >= crowd.count) break;
    if (view) {
      const dx = crowd.x[person]! - view.x;
      const dy = crowd.y[person]! + middle - view.y;
      const dz = crowd.z[person]! - view.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!standsOut(pixelsPerVoxel(view.lens, distance), part.height)) continue;
    }
    const heading = crowd.heading[person]!;
    const yawCos = Math.cos(heading);
    const yawSin = Math.sin(heading);
    const at = slot * 16;
    matrices[at] = yawCos;
    matrices[at + 2] = -yawSin;
    matrices[at + 8] = yawSin;
    matrices[at + 10] = yawCos;
    matrices[at + 12] = crowd.x[person]!;
    matrices[at + 13] = crowd.y[person]!;
    matrices[at + 14] = crowd.z[person]!;
    const packed = slot * POSE_STRIDE;
    pose[packed + POSE_SIN] = yawSin;
    pose[packed + POSE_COS] = yawCos;
    pose[packed + POSE_RESTING] = restingOn(crowd, person);
    pose[packed + POSE_PHASE] = crowd.phase[person]!;
    slot++;
  }
  part.mesh.count = slot;
  part.mesh.instanceMatrix.needsUpdate = true;
  part.pose.needsUpdate = true;
  return slot;
}

/**
 * Puts a crowd on the plot.
 *
 * A crowd with nobody in it — a plot with no paving to walk on — comes back as
 * an empty group rather than as an error, and costs a call to {@link advance}
 * that does nothing. That is a plot nobody can walk on, not a mistake.
 */
export function buildCrowdField(options: CrowdFieldOptions): CrowdField {
  // Rebound by `relocate`, so every closure below reads this binding rather than
  // holding a crowd of its own.
  let crowd = options.crowd;
  const { models } = options;
  const group = new Group();
  group.name = 'crowd';

  const walk = figureMaterial(options.lightVolume ?? null);
  const parts: PersonMesh[] = [];
  for (const [variant, model] of models.entries()) {
    const part = buildPersonMesh(model, walk.material, crowd, variant);
    if (!part) continue;
    parts.push(part);
    group.add(part.mesh);
  }

  let clock = 0;
  let view: DetailView | null = null;
  let drawnCount = 0;
  const writeAll = (): void => {
    drawnCount = 0;
    for (const part of parts) drawnCount += writeInstances(part, crowd, view);
  };
  writeAll();

  return {
    group,
    get crowd() {
      return crowd;
    },
    get count() {
      return crowd.count;
    },
    get drawnCount() {
      return drawnCount;
    },
    setView(next) {
      view = next;
    },
    drawCalls: parts.length,
    triangleCount: parts.reduce((total, part) => total + part.triangles * part.people.length, 0),
    advance(dt, scale) {
      // Clamped once, here, and spent on both halves of the walk: a tab that was
      // in the background for a minute must not teleport the crowd across the
      // plot, and must not spin its legs to catch up either. The legs swing at
      // the same scale the crowd walks at, or a guest hurrying across the plot at
      // `normal` would glide on a stroll's stride.
      const step = Math.min(Math.max(dt, 0), MAX_STEP) * scale;
      // `> 0` so a NaN from either factor is refused along with a paused frame.
      if (step > 0) {
        stepCrowd(crowd, step);
        clock += step;
        walk.setClock(clock);
      }
      writeAll();
    },
    relocate(network) {
      crowd = reseatCrowd(crowd, network);
      // Now rather than on the next frame, so nothing is drawn with people
      // standing where the old graph had them.
      writeAll();
    },
    dispose() {
      for (const part of parts) {
        part.mesh.dispose();
        // This field's own clone, unlike the model geometry it was taken from:
        // that one belongs to the meshed catalogue and outlives every resort.
        part.geometry.dispose();
      }
      group.clear();
      walk.material.dispose();
    },
  };
}
