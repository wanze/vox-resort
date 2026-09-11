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
import { figureGeometry, figureMaterial } from '../../rendering/adapters/figureField';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { MAX_STEP, restingOn, stepCrowd, type Crowd } from '../domain/crowd';

export interface CrowdField {
  readonly group: Group;
  /** People being drawn. */
  readonly count: number;
  /** Draw calls this costs: one per person model somebody is walking in. */
  readonly drawCalls: number;
  /** Triangles it submits per frame, across everybody drawn. */
  readonly triangleCount: number;
  /**
   * Steps the crowd by a frame's worth of seconds and writes where everybody
   * ended up.
   *
   * One call rather than two because the walk cycle and the walk have to be
   * stepped by the *same* clamped `dt` — see {@link MAX_STEP} — and a caller
   * holding both halves of that is a caller who can get it wrong.
   */
  advance(dt: number): void;
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
  /**
   * Which way each person is walking, as `(sin, cos)` of their heading: the
   * direction their legs swing along.
   *
   * The same turn the instance matrix carries, in the form the shader can use:
   * see `figureMaterial` for why the matrix is no help to it. It costs the two
   * numbers the matrix write already worked out.
   */
  readonly facing: InstancedBufferAttribute;
  /**
   * What each person is doing, as `RESTING`: 0 walking, 1 sitting, 2 lying.
   *
   * A float rather than two flags because the shader takes it apart with two
   * multiplies (see `figureMaterial`), and per instance rather than per person
   * because that is the buffer the draw reads. It is written with the matrix,
   * off the one integer the crowd keeps.
   */
  readonly resting: InstancedBufferAttribute;
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

  const phase = geometry.getAttribute('phase');
  const matrices = mesh.instanceMatrix.array;
  for (const [slot, person] of people.entries()) {
    phase.setX(slot, crowd.phase[person]!);
    // The parts of the matrix a walking person never changes, written once: the
    // buffer is zero-filled, so this is the whole of the rest of it. The frame
    // loop then writes seven numbers per person rather than sixteen.
    matrices[slot * 16 + 5] = 1;
    matrices[slot * 16 + 15] = 1;
  }
  return {
    mesh,
    geometry,
    people: Int32Array.from(people),
    triangles: (geometry.getIndex()?.count ?? 0) / 3,
    facing: geometry.getAttribute('facing') as InstancedBufferAttribute,
    resting: geometry.getAttribute('resting') as InstancedBufferAttribute,
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
 * All three buffers go up whole, without update ranges: everybody moved.
 */
function writeInstances(part: PersonMesh, crowd: Crowd): void {
  const matrices = part.mesh.instanceMatrix.array;
  const facing = part.facing.array;
  const resting = part.resting.array;
  for (let slot = 0; slot < part.people.length; slot++) {
    const person = part.people[slot]!;
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
    facing[slot * 2] = yawSin;
    facing[slot * 2 + 1] = yawCos;
    resting[slot] = restingOn(crowd, person);
  }
  part.mesh.instanceMatrix.needsUpdate = true;
  part.facing.needsUpdate = true;
  part.resting.needsUpdate = true;
}

/**
 * Puts a crowd on the plot.
 *
 * A crowd with nobody in it — a plot with no paving to walk on — comes back as
 * an empty group rather than as an error, and costs a call to {@link advance}
 * that does nothing. That is a plot nobody can walk on, not a mistake.
 */
export function buildCrowdField(options: CrowdFieldOptions): CrowdField {
  const { crowd, models } = options;
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
  for (const part of parts) writeInstances(part, crowd);

  return {
    group,
    get count() {
      return crowd.count;
    },
    drawCalls: parts.length,
    triangleCount: parts.reduce((total, part) => total + part.triangles * part.people.length, 0),
    advance(dt) {
      // Clamped once, here, and spent on both halves of the walk: a tab that was
      // in the background for a minute must not teleport the crowd across the
      // plot, and must not spin its legs to catch up either.
      const step = Math.min(Math.max(dt, 0), MAX_STEP);
      if (step === 0) return;
      stepCrowd(crowd, step);
      clock += step;
      walk.setClock(clock);
      for (const part of parts) writeInstances(part, crowd);
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
