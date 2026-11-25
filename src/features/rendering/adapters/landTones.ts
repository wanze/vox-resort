import type { Node } from 'three/webgpu';
import {
  attribute,
  floor,
  fract,
  mix,
  normalWorld,
  positionLocal,
  sin,
  smoothstep,
  step,
  vec3,
} from 'three/tsl';
import { linearRgbOf } from '../../lighting/domain/lightGrid';

const toneOf = (color: number): Node<'vec3'> => vec3(...linearRgbOf(color));

// In voxels: thick enough to read as the grass hanging over the cut from the zoomed-out camera.
const TURF_DEPTH = 2;

// Three voxels a layer, so a level shows two or three; the tones sit close so no layer jumps out.
const LAYER_HEIGHT = 3;
const EARTH_LAYERS = [0x6b5a3e, 0x75634a, 0x5f5038] as const;

// Laid by world height, so a layer runs on unbroken from one drop to the next as rock strata do.
function earthLayers(): Node<'vec3'> {
  const layer = floor(positionLocal.y.div(LAYER_HEIGHT));
  const pick = fract(sin(layer.mul(12.9898)).mul(43758.5453));
  const [first, second, third] = EARTH_LAYERS.map(toneOf) as [
    Node<'vec3'>,
    Node<'vec3'>,
    Node<'vec3'>,
  ];
  return mix(mix(first, second, step(0.4, pick)), third, step(0.75, pick));
}

// Earth below a lip of turf, measured down from each riser's own crest. The crest comes from the
// geometry, as a height taken off world y would put a lip at every level of a deep drop.
export function turfEdge(turf: number): Node<'vec3'> {
  const depth = attribute<'float'>('crest', 'float').sub(positionLocal.y);
  return mix(earthLayers(), toneOf(turf), step(depth, TURF_DEPTH));
}

// From the softened normal, so a dune's crest and foot fade into the flat sand beside them.
// A rising ramp negated: swapping smoothstep edges is undefined in WGSL and GLSL.
export function duneFace(flat: number, steep: number): Node<'vec3'> {
  const steepness = smoothstep(0.65, 0.97, normalWorld.y).oneMinus();
  return mix(toneOf(flat), toneOf(steep), steepness);
}
