/**
 * What a field of drawn people is made of: the figure's geometry, and the one
 * material that walks it, sits it down and lays it flat.
 *
 * Two features draw people now. The crowd walks a few hundred of them over the
 * plot's paving, and the bay sits a couple of dozen in its boats. They are the
 * same art, in the same three poses, so they are the same geometry and the same
 * shader; what differs is only what moves them, and that is what each field
 * keeps. See `crowd/adapters/crowdField.ts` and `sea/adapters/crewField.ts`.
 *
 * Here rather than in `crowd/` because the sea does not otherwise depend on the
 * crowd at all: a passenger is not on the walk network, holds no seat of it and
 * is not one of its people. It is `movingField.ts`'s reason for existing,
 * applied to the one kind of field that file explicitly does not serve.
 *
 * Which is the third kind, and worth naming beside the other two. A **moving
 * field** (`movingField.ts`) hangs a model on its own middle and writes a matrix
 * per instance per frame. A **chunked field** (`domain/spatialChunks.ts`) buckets
 * static instances so the renderer can reject a whole bucket. A **figure field**
 * is a moving field with three differences, all of them because the thing drawn
 * is a person:
 *
 * - **It is hung on its feet**, not centred on its box, so what a caller writes
 *   is where somebody stands rather than where the corner of their box is.
 * - **It carries baked per-vertex data**, which is what lets one material draw
 *   an adult and a child: the walk weight, and the figure in its own axes. Past
 *   the instance matrix those axes are gone, and a uniform would be a uniform
 *   per model on a material every model shares.
 * - **It carries per-instance data** the shader reads alongside the matrix:
 *   which way the figure faces, which of the three poses it is in, and where in
 *   its stride it is.
 *
 * **Both are packed into one `vec4` attribute each, and that is load-bearing.**
 * WebGPU gives a pipeline eight vertex buffers. A figure's position, normal and
 * colour take three; once a model draws more than 1 024 people, Three.js moves
 * the instance matrix out of a uniform buffer and into a vertex buffer of its
 * own, which takes a fourth. Six separate attributes on top of that was nine,
 * the pipeline failed to build, and a large resort drew nobody at all — while a
 * small one, under the threshold, drew everybody. `crowdField.test.ts` counts
 * the buffers.
 *
 * The poses are drawn, not modelled, and that is the load-bearing decision. A
 * second and third geometry is what it avoids, and the cost is not the geometry:
 * it is that a person sitting down would have to be moved from one mesh's
 * instance slots into another's, on fields whose slots are handed out once.
 */

import {
  BufferAttribute,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type BufferGeometry,
  type MeshStandardNodeMaterial,
} from 'three/webgpu';
import { attribute, positionLocal, sin, uniform, vec3 } from 'three/tsl';
import { hipHeight } from '../../../../voxel-gen/people/figure.ts';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { litMaterial } from './instancedWorld';
import type { ModelGeometry } from './voxelMeshBuilder';

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
 *
 * The reach is also what the art has to be drawn around, and the boats are
 * where that first bit: nearly three voxels of leg in front of a seat is three
 * voxels of thwart, oar or footwell that has to be clear. See
 * `voxel-gen/sea/rowboat.ts`.
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

/**
 * A person model's geometry, centred on its own feet and weighted for the walk.
 *
 * Cloned rather than used as it stands, for two reasons that both come back to
 * the geometries belonging to the meshed catalogue, which is built once at load
 * and outlives every resort: the figure is translated so that the instance
 * matrix is a turn about the person rather than about the corner of their
 * bounding box, and it is given attributes of a size only the caller knows. A
 * field rebuilt for a new resort would otherwise be translating the same
 * geometry a second time.
 *
 * `figure` is baked per vertex, as `(swing, axis, thick, hip)`. `swing` is the
 * walk weight: how far that vertex is dragged by the leg swing, signed by which
 * leg it belongs to. It is baked here because it is a fact about where the
 * figure's legs are — the sign is which side of the centre line a vertex sits,
 * and the taper is how far below the hip — and baking it leaves the shader one
 * multiply, with no per-model constant in it. That is what lets one material
 * draw an adult and a child, whose hips are at different heights.
 *
 * `pose` is per instance, as `(sin, cos, resting, phase)` — see
 * {@link POSE_STRIDE} — and filled by the caller, which is the only thing that
 * knows who stands where.
 */
export function figureGeometry(model: ModelGeometry, capacity: number): BufferGeometry {
  if (!model.lit) throw new Error(`Nothing was meshed for the person model "${model.id}"`);
  const geometry = model.lit.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const height = box.max.y - box.min.y;
  // Centred across and along, and standing on its own feet: what a field writes
  // is where a person is, not where the corner of their box is.
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

  const positions = geometry.getAttribute('position');
  const hip = hipHeight(height);
  const figure = new Float32Array(positions.count * 4);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    // Nothing above the hip swings, the feet swing fully, and the left leg
    // swings against the right — which after the centring above is the sign of
    // x. A greedy quad running the height of a leg carries the taper across
    // itself, because the two ends interpolate.
    const taper = hip > 0 ? Math.max(0, (hip - positions.getY(vertex)) / hip) : 0;
    figure[vertex * 4] = Math.sign(positions.getX(vertex)) * taper;
    // The figure in its own terms, which is what both poses are worked out in:
    // how far up or down the body a vertex is from the hip, how far through its
    // thickness, and where this model's hip is at all. Baked rather than
    // computed, for the reason the swing weight is: past the instance matrix
    // the figure's own axes are gone, and a uniform would be a uniform per
    // model on a material every model shares. Three floats on a figure of a few
    // dozen vertices, and it keeps the adult and the child on one material.
    figure[vertex * 4 + 1] = positions.getY(vertex) - hip;
    figure[vertex * 4 + 2] = positions.getZ(vertex);
    figure[vertex * 4 + 3] = hip;
  }
  geometry.setAttribute('figure', new BufferAttribute(figure, 4));
  const pose = new InstancedBufferAttribute(new Float32Array(capacity * POSE_STRIDE), POSE_STRIDE);
  pose.setUsage(DynamicDrawUsage);
  geometry.setAttribute('pose', pose);
  return geometry;
}

/**
 * Floats per instance in a figure's `pose` attribute, and where each one sits:
 * which way the figure faces as `(sin, cos)` of its heading, what it is doing as
 * `RESTING` (0 walking, 1 standing, 2 sitting, 3 lying), and its walk phase in
 * radians.
 */
export const POSE_STRIDE = 4;
export const POSE_SIN = 0;
export const POSE_COS = 1;
export const POSE_RESTING = 2;
export const POSE_PHASE = 3;

/** The lit material every figure is drawn with, and the clock its walk runs on. */
export interface FigureMaterial {
  readonly material: MeshStandardNodeMaterial;
  /**
   * Moves the walk cycle on; seconds, and the field's own clamped ones.
   *
   * A field whose people never walk never has to call it, which is the bay: a
   * passenger is seated for as long as they are aboard, and the pose the shader
   * folds them into does not read the clock.
   */
  setClock(seconds: number): void;
}

/**
 * The material a figure is drawn with: the resort's own lit material, with the
 * walk and the two resting poses hung off its `positionNode`.
 *
 * The wave is computed once and spent twice. It swings the legs, scaled by the
 * per-vertex weight `figureGeometry` baked; and its own absolute value, turned
 * over, lifts the whole figure — the body is highest with the legs together,
 * which is where the swing crosses zero. So a walk is one `sin` per vertex and
 * nothing per person per frame.
 *
 * The two poses ride the same node, each scaled by one of the two weights the
 * instanced pose's `resting` float is taken apart into, so a vertex pays for all
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
 * Which is why the swing needs the heading in the pose: past the instance matrix
 * there is no local +z left to swing a leg along, so the direction the person is
 * walking is handed to the shader as the vector it already is. The per-vertex
 * weight is still read off the *unturned* geometry, which is where knowing which
 * leg a vertex belongs to still means something.
 *
 * It is also why a passenger on a boat is folded about the *world's* up rather
 * than the hull's. A boat heels three degrees and pitches less, and the fold is
 * three voxels at most, so the hips miss the seat by five thousandths of a
 * voxel: a second set of axes to carry per instance, to move nothing.
 *
 * The clock is this module's own rather than TSL's `time`, because it has to be
 * the field's clock: clamped against a backgrounded tab, and fixed when a
 * benchmark is pinning the scene down.
 */
export function figureMaterial(volume: BakedLightVolume | null): FigureMaterial {
  const clock = uniform(0);
  const material = litMaterial(volume);
  const pose = attribute<'vec4'>('pose', 'vec4');
  const facing = pose.xy;
  // The figure in its own terms: `weight` is the walk weight, `axis` how far up
  // the body from the hip a vertex is and negative down the legs, `thick` how
  // far through its depth, `hip` where this model's hip stands. See
  // {@link figureGeometry}.
  const figure = attribute<'vec4'>('figure', 'vec4');
  const weight = figure.x;
  const axis = figure.y;
  const thick = figure.z;
  const hip = figure.w;

  // What the person is doing, taken apart with arithmetic rather than a branch:
  // a shader has no cheap branch, and all but one of these is always zero.
  // 0 walking, 1 standing, 2 sitting, 3 lying — see `RESTING` in
  // `crowd/domain/crowd.ts`, whose order this decomposition depends on.
  //
  // Standing is every weight at zero, which is the figure as it was modelled:
  // upright, legs together, no bob. So it costs a number and not a pose.
  const doing = pose.z;
  const still = doing.min(1);
  const lying = doing.sub(2).max(0);
  const sitting = doing.sub(1).max(0).min(1).sub(lying);
  const afoot = still.oneMinus();

  const wave = sin(clock.mul(CADENCE).add(pose.w));
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
