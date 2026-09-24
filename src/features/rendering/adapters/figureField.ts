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
import { attribute, positionLocal, sin, uniform, vec3 } from 'three/tsl';
import { hipHeight } from '../../../../voxel-gen/people/figure.ts';
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

// Zero would bury the back in the mattress: a voxel at y fills [y, y+1].
const LIE_CLEAR = 1;

// Cloned: the catalogue geometry outlives every resort, and a rebuilt field
// would translate it twice.
export function figureGeometry(model: ModelGeometry, capacity: number): BufferGeometry {
  if (!model.lit) throw new Error(`Nothing was meshed for the person model "${model.id}"`);
  const geometry = model.lit.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const height = box.max.y - box.min.y;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

  const positions = geometry.getAttribute('position');
  const hip = hipHeight(height);
  const figure = new Float32Array(positions.count * 4);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    // The left leg swings against the right, which after the centring is the sign of x.
    const taper = hip > 0 ? Math.max(0, (hip - positions.getY(vertex)) / hip) : 0;
    figure[vertex * 4] = Math.sign(positions.getX(vertex)) * taper;
    // Baked per vertex: past the instance matrix the figure's own axes are gone, and a
    // per-model uniform cannot live on a material every model shares.
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

// (sin, cos) of the heading, RESTING (0 walking, 1 standing, 2 sitting, 3 lying), walk phase.
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

  // Decomposed with arithmetic, not a branch; depends on the order of RESTING
  // in crowd/domain/crowd.ts.
  const doing = pose.z;
  const still = doing.min(1);
  const lying = doing.sub(2).max(0);
  const sitting = doing.sub(1).max(0).min(1).sub(lying);
  const afoot = still.oneMinus();

  const wave = sin(clock.mul(CADENCE).add(pose.w));
  const swing = wave.mul(weight).mul(SWING_VOXELS).mul(afoot);
  const bob = wave.abs().oneMinus().mul(BOB_VOXELS).mul(afoot);

  const leg = axis.negate().max(0);
  const sitAlong = leg.mul(SIT_REACH);
  const sitUp = leg.mul(SIT_RISE).sub(hip);

  // Turned on its back about the hips, taking out what the instance matrix
  // already added along those axes.
  const lieAlong = axis.add(thick).negate();
  const lieUp = thick.add(LIE_CLEAR).sub(axis).sub(hip);

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
