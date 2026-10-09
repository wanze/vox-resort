// Per-vertex and per-instance data are packed into one vec4 attribute each: WebGPU
// allows eight vertex buffers, and past 1024 instances Three.js moves the instance
// matrix into one of its own. crowdField.test.ts counts them.

import {
  BufferAttribute,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type BufferGeometry,
  type MeshStandardNodeMaterial,
} from 'three/webgpu';
import { attribute, cos, PI, positionLocal, sin, uniform, vec3 } from 'three/tsl';
import {
  ADULT_VOXELS,
  CHEST_HALF_WIDTH,
  handHeight,
  hipHeight,
  shoulderHeight,
} from '../../../../voxel-gen/people/figure.ts';
import { RESTING } from '../../crowd/domain/crowd';
import { sealFigure } from '../domain/figureLimbs';
import { DRAWN_POSE } from '../domain/poses';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { litMaterial } from './instancedWorld';
import type { ModelGeometry } from './voxelMeshBuilder';

// One cadence for everyone: per person would need another instanced buffer, and nobody sees it.
const CADENCE = 5.3;

const SWING_VOXELS = 1.2;

const BOB_VOXELS = 0.12;

// Sine and cosine of a thigh swung forward off a seat, chosen so the leg keeps its length.
const SIT_RISE = 0.5;
const SIT_REACH = 0.9;

// Forward onto the lap: hanging straight, a hand below the hip would sink into the seat.
const SIT_ARMS = 1;

// Zero would bury the back in the mattress: a voxel at y fills [y, y+1].
const LIE_CLEAR = 1;

// The same for a child: only the legs are shorter.
const SHOULDER_ABOVE_HIP = shoulderHeight(ADULT_VOXELS) - hipHeight(ADULT_VOXELS);

// Radians of arm swing either way; the hand travels about as far as the foot does.
const ARM_SWING = 0.5;

const JOG_CADENCE = 8.5;

const KICK = 11;
const KICK_VOXELS = 0.35;

const STROKE = 3.2;

// The CPU puts a swimmer on the water surface; this leaves a quarter voxel of back above it.
const SWIM_DEPTH = 0.75;

const FLOAT_RATE = 1.7;
const FLOAT_VOXELS = 0.1;

// Held a little forward, hands on the water, and sculled either way about that.
const WADE_REACH = 0.5;
const SCULL = 0.35;
const SCULL_RATE = 2.2;

const HOP_RATE = 7;
const HOP_VOXELS = 1.5;
const HOP_ARMS = 2.6;

// Kept short of a right angle: the legs bend by shearing, which would turn them inside out.
const TUCK = 0.9;

const CHEER_RATE = 6;
const CHEER_SWAY = 0.35;
const CHEER_BOUNCE_VOXELS = 0.25;

const STRIKE_REACH = 2.2;

// One arm up and forward, holding the stick towards a camera in front.
const SELFIE_REACH = 2.4;

// Both arms forward, a little above level: a phone held out at eye height, as the arm has no elbow.
const PHOTO_ARMS = 0.55 * Math.PI;

const REACH_HOP_VOXELS = 0.8;

// Past any leg's taper, so the shader tells an arm from a leg by the weight alone: the hands
// hang below the hip.
export const ARM_WEIGHT = 2;

// Every vertex in `order`, so an added one repeats its template's colour and the rest.
function grown(from: BufferGeometry['attributes'][string], order: readonly number[]): Float32Array {
  const size = from.itemSize;
  const values = new Float32Array(order.length * size);
  for (const [at, vertex] of order.entries()) {
    for (let item = 0; item < size; item++)
      values[at * size + item] = from.getComponent(vertex, item);
  }
  return values;
}

function sealed(geometry: BufferGeometry, hip: number, height: number): Uint8Array {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index) return new Uint8Array(positions.count);
  const seams = sealFigure(
    { positions: positions.array, indices: index.array },
    {
      hip,
      shoulder: shoulderHeight(height),
      hand: handHeight(height),
      chestHalfWidth: CHEST_HALF_WIDTH,
    },
  );
  const order = [
    ...Array.from({ length: positions.count }, (_, vertex) => vertex),
    ...seams.templates,
  ];
  const placed: Readonly<Record<string, Float32Array>> = {
    position: seams.positions,
    normal: seams.normals,
  };
  for (const [name, from] of Object.entries(geometry.attributes)) {
    const values = grown(from, order);
    if (name in placed) values.set(placed[name]!, positions.count * 3);
    geometry.setAttribute(name, new BufferAttribute(values, from.itemSize));
  }
  geometry.setIndex(new BufferAttribute(seams.indices, 1));
  return seams.onArm;
}

// Cloned: the catalogue geometry outlives every resort, and a rebuilt field
// would translate it twice.
export function figureGeometry(model: ModelGeometry, capacity: number): BufferGeometry {
  if (!model.lit) throw new Error(`Nothing was meshed for the person model "${model.id}"`);
  const geometry = model.lit.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const height = box.max.y - box.min.y;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

  const hip = hipHeight(height);
  const onArm = sealed(geometry, hip, height);
  const positions = geometry.getAttribute('position');
  const figure = new Float32Array(positions.count * 4);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const y = positions.getY(vertex);
    // An arm turns whole about the shoulder, so it carries only its side; the shader measures
    // it from the shoulder by the axis.
    const reach = onArm[vertex] ? ARM_WEIGHT : hip > 0 ? Math.max(0, (hip - y) / hip) : 0;
    // A limb swings against its twin on the other side, which after the centring is the sign of x.
    figure[vertex * 4] = Math.sign(positions.getX(vertex)) * reach;
    // Baked per vertex: past the instance matrix the figure's own axes are gone, and a
    // per-model uniform cannot live on a material every model shares.
    figure[vertex * 4 + 1] = y - hip;
    figure[vertex * 4 + 2] = positions.getZ(vertex);
    figure[vertex * 4 + 3] = hip;
  }
  geometry.setAttribute('figure', new BufferAttribute(figure, 4));
  geometry.computeBoundingSphere();
  const pose = new InstancedBufferAttribute(new Float32Array(capacity * POSE_STRIDE), POSE_STRIDE);
  pose.setUsage(DynamicDrawUsage);
  geometry.setAttribute('pose', pose);
  return geometry;
}

// (sin, cos) of the heading, the pose (a RESTING or DRAWN_POSE code, plus poseWith's progress),
// walk phase.
export const POSE_STRIDE = 4;
export const POSE_SIN = 0;
export const POSE_COS = 1;
export const POSE_RESTING = 2;
export const POSE_PHASE = 3;

export interface FigureMaterial {
  readonly material: MeshStandardNodeMaterial;
  setClock(seconds: number): void;
}

// positionNode runs last and assigns rather than adds, so this builds on positionLocal
// (already instanced); the raw attribute would stand the whole crowd on the origin.
// The clock is our own uniform, not TSL time, so it is the field's clamped clock.
export function figureMaterial(volume: BakedLightVolume | null): FigureMaterial {
  const clock = uniform(0);
  const material = litMaterial(volume);
  const pose = attribute<'vec4'>('pose', 'vec4');
  const facing = pose.xy;
  const figure = attribute<'vec4'>('figure', 'vec4');
  const weight = figure.x;
  const axis = figure.y;
  const thick = figure.z;
  const hip = figure.w;

  // One weight per code, not a branch: a vertex shader pays for every pose either way.
  const code = pose.z.floor();
  const progress = pose.z.fract();
  const is = (k: number) => code.sub(k).abs().step(0.5).oneMinus();
  const walking = is(RESTING.none);
  const sitting = is(RESTING.sitting);
  const lying = is(RESTING.lying);
  const swimming = is(DRAWN_POSE.swim);
  const wading = is(DRAWN_POSE.wade);
  const hopping = is(DRAWN_POSE.hop);
  const cheering = is(DRAWN_POSE.cheer);
  const jogging = is(DRAWN_POSE.jog);
  const striking = is(DRAWN_POSE.strike);
  const reaching = is(DRAWN_POSE.reach);
  const selfie = is(DRAWN_POSE.selfie);
  const photographing = is(DRAWN_POSE.photo);

  const phase = pose.w;
  const cycle = (rate: number) => clock.mul(rate).add(phase);
  const onArm = weight.abs().step((1 + ARM_WEIGHT) / 2);
  const offArm = onArm.oneMinus();
  const side = weight.sign().mul(onArm);
  const legW = weight.mul(offArm);
  // How far below the hip, for bending a leg; a hand hangs below it too, but is not bent.
  const leg = axis.negate().max(0).mul(offArm);

  const gait = walking.mul(sin(cycle(CADENCE))).add(jogging.mul(sin(cycle(JOG_CADENCE))));
  const hopLift = sin(cycle(HOP_RATE)).max(0);
  const kick = swimming.mul(sin(cycle(KICK))).mul(KICK_VOXELS);
  const legAlong = legW.mul(gait.mul(SWING_VOXELS).add(kick));
  const tuck = hopping.mul(hopLift).mul(TUCK);
  const tuckAlong = leg.mul(sin(tuck));
  const tuckUp = leg.mul(cos(tuck).oneMinus());

  // Half a stroke apart, and turned backwards: from overhead the pull runs under the body and
  // the recovery over the back.
  const crawl = cycle(STROKE)
    .negate()
    .add(side.oneMinus().mul(PI.div(2)));
  const armAngle = gait
    .mul(side.negate())
    .mul(ARM_SWING)
    .add(swimming.mul(crawl))
    .add(
      wading.mul(
        side
          .mul(sin(cycle(SCULL_RATE)))
          .mul(SCULL)
          .add(WADE_REACH),
      ),
    )
    .add(hopping.mul(hopLift).mul(HOP_ARMS))
    .add(
      cheering.mul(
        side
          .mul(sin(cycle(CHEER_RATE)))
          .mul(CHEER_SWAY)
          .add(PI),
      ),
    )
    .add(
      striking
        .mul(side.max(0))
        .mul(sin(progress.mul(PI)))
        .mul(STRIKE_REACH),
    )
    .add(reaching.mul(progress).mul(PI))
    .add(selfie.mul(side.max(0)).mul(SELFIE_REACH))
    .add(photographing.mul(PHOTO_ARMS))
    .add(sitting.mul(SIT_ARMS));
  // A true turn about the shoulder, thickness and all: a shear, as the legs bend, would turn a
  // raised arm inside out and the back faces would be culled.
  const fromShoulder = axis.sub(SHOULDER_ABOVE_HIP);
  const armCos = cos(armAngle).sub(1);
  const armSin = sin(armAngle);
  const armAlong = thick.mul(armCos).sub(fromShoulder.mul(armSin)).mul(onArm);
  const armUp = thick.mul(armSin).add(fromShoulder.mul(armCos)).mul(onArm);

  const limbAlong = legAlong.add(tuckAlong).add(armAlong);
  const limbUp = tuckUp.add(armUp);
  const bodyThick = thick.add(limbAlong);
  const bodyAxis = axis.add(limbUp);

  const bob = walking.add(jogging).mul(gait.abs().oneMinus()).mul(BOB_VOXELS);
  const lift = bob
    .add(hopping.mul(hopLift).mul(HOP_VOXELS))
    .add(cheering.mul(sin(cycle(CHEER_RATE)).abs()).mul(CHEER_BOUNCE_VOXELS))
    .add(
      swimming
        .add(wading)
        .mul(sin(cycle(FLOAT_RATE)))
        .mul(FLOAT_VOXELS),
    )
    .add(reaching.mul(sin(progress.mul(PI))).mul(REACH_HOP_VOXELS));

  const sitAlong = leg.mul(SIT_REACH);
  const sitUp = leg.mul(SIT_RISE).sub(hip);

  // Turned about the hips, on the back to lie and face down to swim, taking out what the
  // instance matrix already added along those axes.
  const lieAlong = bodyAxis.add(bodyThick).negate();
  const lieUp = bodyThick.add(LIE_CLEAR).sub(bodyAxis).sub(hip);
  const swimAlong = bodyAxis.sub(bodyThick);
  const swimUp = bodyThick.add(SWIM_DEPTH).add(bodyAxis).add(hip).negate();

  const along = limbAlong
    .add(sitAlong.mul(sitting))
    .add(lieAlong.mul(lying))
    .add(swimAlong.mul(swimming));
  const up = limbUp
    .add(lift)
    .add(sitUp.mul(sitting))
    .add(lieUp.mul(lying))
    .add(swimUp.mul(swimming));
  material.positionNode = positionLocal.add(vec3(along.mul(facing.x), up, along.mul(facing.y)));
  return {
    material,
    setClock(seconds) {
      clock.value = seconds;
    },
  };
}
