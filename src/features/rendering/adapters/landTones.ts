import type { Node } from 'three/webgpu';
import {
  dot,
  floor,
  fract,
  mix,
  normalWorld,
  positionWorld,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
} from 'three/tsl';
import { linearRgbOf } from '../../lighting/domain/lightGrid';

const toneOf = (color: number): Node<'vec3'> => vec3(...linearRgbOf(color));

// In voxels: a level is eight high, so four courses to a step, and every other course is
// offset half a block, as a laid wall is.
const COURSE_HEIGHT = 2;
const BLOCK_LENGTH = 4;
const STONES = [0x8f8577, 0xa39887, 0x7a7165] as const;

// Picked per block by world position, so the courses run on unbroken from one tile to the next.
export function stoneCourses(): Node<'vec3'> {
  const course = floor(positionWorld.y.div(COURSE_HEIGHT));
  const along = positionWorld.x.add(positionWorld.z).div(BLOCK_LENGTH).add(course.mul(0.5));
  const pick = fract(sin(dot(vec2(course, floor(along)), vec2(12.9898, 78.233))).mul(43758.5453));
  const [first, second, third] = STONES.map(toneOf) as [Node<'vec3'>, Node<'vec3'>, Node<'vec3'>];
  return mix(mix(first, second, step(0.4, pick)), third, step(0.75, pick));
}

// From the softened normal, so a dune's crest and foot fade into the flat sand beside them.
// A rising ramp negated: swapping smoothstep edges is undefined in WGSL and GLSL.
export function duneFace(flat: number, steep: number): Node<'vec3'> {
  const steepness = smoothstep(0.65, 0.97, normalWorld.y).oneMinus();
  return mix(toneOf(flat), toneOf(steep), steepness);
}
