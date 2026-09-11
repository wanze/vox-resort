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
 * yaw twice — once as the instance matrix and once as the direction vector it
 * was built from, which is what the shader swings a leg along. Each figure then
 * carries a per-vertex `swing` weight, baked once from where its legs are, and
 * each instance a `phase`, so one `sin` in a `positionNode` swings six hundred
 * pairs of legs out of step with each other for no per-frame CPU at all. See
 * {@link walkMaterial}, which is also where the reason the direction cannot just
 * be read back off the matrix is written down.
 *
 * **Sitting and lying down are drawn, not modelled.** A figure at rest is the
 * same geometry as a walking one, folded by the same `positionNode` the walk
 * rides on. Sitting: the body drops onto the seat by the height of its own hips
 * and the legs — the vertices the walk already knows about, because they are the
 * ones it swings — swing forward and down about the hip. Lying: the whole figure
 * is turned on its back about the same hip, so it runs along the lounger with
 * its head at the raised end. One instanced float says which of the three each
 * person is doing. See {@link walkMaterial}, and `docs/crowd.md`.
 *
 * A second and third geometry are what that avoids, and the cost is not the
 * geometry: it is that a person sitting down would have to be moved from one
 * mesh's instance slots into another's, every time anybody sat, lay down or got
 * up, on a field whose slots are handed out once and never change.
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
  BufferAttribute,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  type BufferGeometry,
  type MeshStandardNodeMaterial,
} from 'three/webgpu';
import { attribute, positionLocal, sin, uniform, vec3 } from 'three/tsl';
import { hipHeight } from '../../../../voxel-gen/people/figure.ts';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { litMaterial } from '../../rendering/adapters/instancedWorld';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { MAX_STEP, restingOn, stepCrowd, type Crowd } from '../domain/crowd';

/**
 * How fast the legs swing, in radians a second.
 *
 * A person walking at 1.4 m/s takes a little under two steps a second, and a
 * full cycle is two steps — so about 0.85 Hz, which is this over 2π. One cadence
 * for the whole crowd rather than one per person: the walking speeds differ by a
 * quarter either way and nothing at this scale reads the difference, whereas a
 * second instanced attribute would be a second buffer to fill.
 */
const CADENCE = 5.3;

/**
 * How far a foot swings from under the hip, in voxels.
 *
 * A voxel is 25 cm and a stride is about 70, so a foot is a little over one
 * voxel from centre at full swing. The weight below tapers it to nothing at the
 * hip, so this is what the *feet* travel and not what the legs shear.
 */
const SWING_VOXELS = 1.2;

/**
 * How far the body rises between steps, in voxels.
 *
 * Three centimetres. A walk is a fall caught twice a stride, and the body is
 * highest with the legs together — which is where the swing is zero, so it rides
 * the same wave rather than needing one of its own.
 */
const BOB_VOXELS = 0.12;

/**
 * How much of its own length a folded leg gives back in height, and how far
 * forward it reaches, as fractions of the hip height.
 *
 * These are one thing said twice: they are the sine and cosine of a thigh
 * swung down and forward off a seat, and the pair is chosen so that the leg
 * keeps about the length it had — 1.5 voxels down and 2.7 forward on an adult's
 * three voxels of leg, which is a hypotenuse of 3.1. A pair that did not would
 * either tear the leg off the hip or telescope it.
 *
 * The result is a figure whose feet land half a voxel above the paving from a
 * bench seat two voxels over it, which is what sitting looks like. It is not a
 * knee: a knee needs a second joint and this grid gives a leg three voxels to
 * hold one in.
 */
const SIT_RISE = 0.5;
const SIT_REACH = 0.9;

/**
 * How far a lying figure's back is lifted off the cushion, in voxels.
 *
 * One, which puts the body in the two voxels above the layer the seat named —
 * the same 50 cm it is wide lying down, because it is the figure's own depth
 * turned upright. Zero would bury the back half of it in the mattress, since a
 * voxel at `y` fills `[y, y+1]` and the cushion is the layer below.
 */
const LIE_CLEAR = 1;

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
   * The same turn the instance matrix carries, in the form the shader can use —
   * see {@link walkMaterial} for why the matrix is no help to it. It costs the
   * two numbers the matrix write already worked out.
   */
  readonly facing: InstancedBufferAttribute;
  /**
   * What each person is doing, as `RESTING`: 0 walking, 1 sitting, 2 lying.
   *
   * A float rather than two flags because the shader takes it apart with two
   * multiplies — see {@link walkMaterial} — and per instance rather than per
   * person because that is the buffer the draw reads. It is written with the
   * matrix, off the one integer the crowd keeps.
   */
  readonly resting: InstancedBufferAttribute;
}

/**
 * A person model's geometry, centred on its own feet and weighted for the walk.
 *
 * Cloned rather than used as it stands, for two reasons that both come back to
 * the geometries belonging to the meshed catalogue, which is built once at load
 * and outlives every resort: the figure is translated so that the instance
 * matrix is a turn about the person rather than about the corner of their
 * bounding box, and it is given attributes of a size only this crowd knows. A
 * field rebuilt for a new resort would otherwise be translating the same
 * geometry a second time.
 *
 * `swing` is the walk weight, per vertex: how far that vertex is dragged by the
 * leg swing, signed by which leg it belongs to. It is baked here because it is a
 * fact about where the figure's legs are — the sign is which side of the centre
 * line a vertex sits, and the taper is how far below the hip — and baking it
 * leaves the shader one multiply, with no per-model constant in it. That is what
 * lets one material draw an adult and a child, whose hips are at different
 * heights.
 */
function figureGeometry(model: ModelGeometry, capacity: number): BufferGeometry {
  if (!model.lit) throw new Error(`Nothing was meshed for the person model "${model.id}"`);
  const geometry = model.lit.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const height = box.max.y - box.min.y;
  // Centred across and along, and standing on its own feet: what the crowd
  // writes is where a person is, not where the corner of their box is.
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

  const positions = geometry.getAttribute('position');
  const hip = hipHeight(height);
  const swing = new Float32Array(positions.count);
  const body = new Float32Array(positions.count * 3);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    // Nothing above the hip swings, the feet swing fully, and the left leg
    // swings against the right — which after the centring above is the sign of
    // x. A greedy quad running the height of a leg carries the taper across
    // itself, because the two ends interpolate.
    const taper = hip > 0 ? Math.max(0, (hip - positions.getY(vertex)) / hip) : 0;
    swing[vertex] = Math.sign(positions.getX(vertex)) * taper;
    // The figure in its own terms, which is what both poses are worked out in:
    // how far up or down the body a vertex is from the hip, how far through its
    // thickness, and where this model's hip is at all. Baked rather than
    // computed, for the reason the swing weight is: past the instance matrix
    // the figure's own axes are gone, and a uniform would be a uniform per
    // model on a material every model shares. Three floats on a figure of a few
    // dozen vertices, and it keeps the adult and the child on one material.
    body[vertex * 3] = positions.getY(vertex) - hip;
    body[vertex * 3 + 1] = positions.getZ(vertex);
    body[vertex * 3 + 2] = hip;
  }
  geometry.setAttribute('swing', new BufferAttribute(swing, 1));
  geometry.setAttribute('body', new BufferAttribute(body, 3));
  // Filled by the caller, which is the only thing that knows who stands where.
  geometry.setAttribute('phase', new InstancedBufferAttribute(new Float32Array(capacity), 1));
  const facing = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
  facing.setUsage(DynamicDrawUsage);
  geometry.setAttribute('facing', facing);
  const resting = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  resting.setUsage(DynamicDrawUsage);
  geometry.setAttribute('resting', resting);
  return geometry;
}

/** The lit material, and the clock the walk cycle runs on. */
interface WalkMaterial {
  readonly material: MeshStandardNodeMaterial;
  /** Moves the walk cycle on; seconds, and the crowd's own clamped ones. */
  setClock(seconds: number): void;
}

/**
 * The material the whole crowd is drawn with: the resort's own lit material,
 * with the walk hung off its `positionNode`.
 *
 * The wave is computed once and spent twice. It swings the legs, scaled by the
 * per-vertex weight `figureGeometry` baked; and its own absolute value, turned
 * over, lifts the whole figure — the body is highest with the legs together,
 * which is where the swing crosses zero. So a walk is one `sin` per vertex and
 * nothing per person per frame.
 *
 * The two poses ride the same node, each scaled by one of the two weights the
 * instanced `resting` attribute is taken apart into, so a vertex pays for all
 * three states and is only ever displaced by one of them. Both are worked out
 * in the figure's own axes, which is why they are baked per vertex: past this
 * point the instance matrix has turned them into the world's.
 *
 * **It builds on `positionLocal`, and that is not a detail.** A material's
 * `positionNode` is applied last of everything Three.js does to a vertex, and it
 * *assigns* rather than adds — so a node written against the raw geometry
 * attribute would throw the instance transform away and stand the whole crowd on
 * the origin. `positionLocal` at this point is the instanced position, so the
 * walk is a displacement of a person already standing where they stand.
 *
 * Which is why the swing needs {@link PersonMesh.facing}: past the instance
 * matrix there is no local +z left to swing a leg along, so the direction the
 * person is walking is handed to the shader as the vector it already is. The
 * per-vertex weight is still read off the *unturned* geometry, which is where
 * knowing which leg a vertex belongs to still means something.
 *
 * The clock is this module's own rather than TSL's `time`, because it has to be
 * the crowd's clock: clamped against a backgrounded tab, and fixed when a
 * benchmark is pinning the scene down.
 */
function walkMaterial(volume: BakedLightVolume | null): WalkMaterial {
  const clock = uniform(0);
  const material = litMaterial(volume);
  const facing = attribute<'vec2'>('facing', 'vec2');
  const weight = attribute<'float'>('swing', 'float');
  // The figure in its own terms: `axis` is how far up the body from the hip a
  // vertex is and negative down the legs, `thick` how far through its depth,
  // `hip` where this model's hip stands. See {@link figureGeometry}.
  const body = attribute<'vec3'>('body', 'vec3');
  const axis = body.x;
  const thick = body.y;
  const hip = body.z;

  // What the person is doing, taken apart with two multiplies rather than a
  // branch: a shader has no cheap branch, and one of these is always zero.
  // 0 walking, 1 sitting, 2 lying — see `RESTING` in `crowd.ts`.
  const doing = attribute<'float'>('resting', 'float');
  const still = doing.min(1);
  const lying = doing.sub(1).max(0);
  const sitting = still.sub(lying);
  const afoot = still.oneMinus();

  const wave = sin(clock.mul(CADENCE).add(attribute<'float'>('phase', 'float')));
  const swing = wave.mul(weight).mul(SWING_VOXELS).mul(afoot);
  const bob = wave.abs().oneMinus().mul(BOB_VOXELS).mul(afoot);

  // Sitting: the body drops by its own hip height, so the hips land on the
  // layer the seat named, and the legs — everything below the hip, which is
  // where `axis` is negative — swing forward and down about it.
  const leg = axis.negate().max(0);
  const sitAlong = leg.mul(SIT_REACH);
  const sitUp = leg.mul(SIT_RISE).sub(hip);

  // Lying: the same figure turned on its back about the same hips, which is
  // three substitutions and no trigonometry. The body's long axis becomes the
  // direction the legs point, so it runs from the head four voxels behind the
  // hips to the feet three in front (`-axis`); its thickness becomes the
  // height, lifted clear of the cushion (`thick + LIE_CLEAR`); and both of the
  // contributions the instance matrix already made along those axes are taken
  // back out — `thick` along the ground, and the vertex's own height, which is
  // `axis + hip`.
  const lieAlong = axis.add(thick).negate();
  const lieUp = thick.add(LIE_CLEAR).sub(axis).sub(hip);

  // Everything that moves the body over the ground shares the one direction it
  // faces: the legs swing along it walking, hang forward along it seated, and
  // the whole figure stretches out along it lying.
  const along = swing.add(sitAlong.mul(sitting)).add(lieAlong.mul(lying));
  const up = bob.add(sitUp.mul(sitting)).add(lieUp.mul(lying));
  material.positionNode = positionLocal.add(vec3(along.mul(facing.x), up, along.mul(facing.y)));
  return {
    material,
    setClock(seconds) {
      clock.value = seconds;
    },
  };
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

  const walk = walkMaterial(options.lightVolume ?? null);
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
