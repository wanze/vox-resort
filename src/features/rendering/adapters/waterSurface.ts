/**
 * What the two bodies of water in the resort have in common: a wave field, and
 * the way water answers the light.
 *
 * The sea and the pools are the same trick at two scales — a sum of travelling
 * sine waves, evaluated only for its slope, bending the shading normal of a
 * surface that never actually moves — so the trick lives here and each material
 * brings its own waves. What differs is only the numbers: the sea runs a
 * ninety-voxel swell in from the horizon, a pool ripples at a metre and a half.
 *
 * Nothing here displaces a vertex, and nothing here decides a colour. See
 * `seaMaterial.ts` for the depth gradient and the foam, and
 * `poolWaterMaterial.ts` for what a body of water with neither of those needs.
 */

import { Vector3 } from 'three/webgpu';
import type { MeshStandardNodeMaterial, Node } from 'three/webgpu';
import {
  cameraPosition,
  cos,
  dot,
  float,
  normalize,
  positionWorld,
  pow,
  saturate,
  sin,
  smoothstep,
  time,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { linearRgbOf } from '../../lighting/domain/lightGrid';

/**
 * One travelling wave.
 *
 * `slope` is the steepness the wave gives the normal, not a height: this shader
 * never has a height, only its gradient. `direction` need not be normalised —
 * it is normalised here — and points the way the crests travel, which for the
 * sea's long swell is in from the water towards the beach at -z.
 */
export interface Wave {
  readonly direction: readonly [number, number];
  /** Voxels between crests. */
  readonly length: number;
  /** Voxels a crest travels per second. */
  readonly speed: number;
  readonly slope: number;
}

/**
 * How many wavelengths away a wave has faded out completely.
 *
 * A wavelength of nine voxels seen from across the plot is a fraction of a
 * pixel, and sampling it once per fragment is aliasing by construction — the
 * water crawls with moiré as the camera moves. Each wave is therefore faded out
 * past the distance at which it stops being resolvable, shortest first, which
 * leaves the far water smooth and the near water detailed. It is a hand-rolled
 * mip chain for a function that has no texture to mip.
 *
 * One number for every wave, so the fade is a property of scale rather than of
 * any particular wave: the ripples go first and the swell survives to the
 * horizon, and adding a wave needs no new constant.
 */
const WAVE_FADE_LENGTHS = 30;

/** The bent shading normal of a wave field, and the height it is the slope of. */
export interface Swell {
  readonly normal: Node<'vec3'>;
  /** Roughly -1..1: a phase rather than a length, since the surface is flat. */
  readonly height: Node<'float'>;
}

/**
 * Sums a set of waves into a shading normal, in world space.
 *
 * Each wave contributes `slope * direction * cos(phase)` to the horizontal part
 * of the normal and nothing to the vertical, which is the gradient of
 * `slope/k * sin(phase)` — the height field this pretends to be. Summing the
 * gradients rather than the heights is what keeps the normal to one cosine per
 * wave; the height is the matching sine.
 */
export function swellOf(waves: readonly Wave[]): Swell {
  const at = positionWorld.xz;
  const viewDistance = positionWorld.sub(cameraPosition).length();
  const totalSlope = waves.reduce((total, wave) => total + wave.slope, 0);
  let slopeX: Node<'float'> = float(0);
  let slopeZ: Node<'float'> = float(0);
  let height: Node<'float'> = float(0);
  for (const wave of waves) {
    const length = Math.hypot(wave.direction[0], wave.direction[1]);
    const dirX = wave.direction[0] / length;
    const dirZ = wave.direction[1] / length;
    const frequency = (Math.PI * 2) / wave.length;
    // Minus the clock, not plus: a crest has to travel *along* its direction,
    // which for the sea's swell is in towards the beach.
    const phase = dot(at, vec2(dirX, dirZ))
      .mul(frequency)
      .sub(time.mul(wave.speed * frequency));
    // Faded out where a wavelength no longer covers a pixel; see the header.
    // Reversed by negating a rising ramp rather than by swapping the edges,
    // which is undefined in both WGSL and GLSL.
    const faded = wave.length * WAVE_FADE_LENGTHS;
    const visible = smoothstep(faded * 0.5, faded, viewDistance).oneMinus();
    const amount = cos(phase).mul(wave.slope).mul(visible);
    slopeX = slopeX.add(amount.mul(dirX));
    slopeZ = slopeZ.add(amount.mul(dirZ));
    // The height this is the gradient of, normalised to roughly -1..1 by
    // dropping the amplitudes: nothing reads it as a length, only as a phase.
    height = height.add(
      sin(phase)
        .mul(wave.slope / totalSlope)
        .mul(visible),
    );
  }
  return { normal: normalize(vec3(slopeX.negate(), 1, slopeZ.negate())), height };
}

/**
 * Roughness of open water.
 *
 * Low, because it is what turns the swell into the moving specular streak the
 * scene's own sun draws across it — the single biggest thing that separates
 * water from painted blue.
 */
export const WATER_ROUGHNESS = 0.14;

/** Reflectance of water head on, and how much of the sky a glancing angle gets. */
const FRESNEL_BASE = 0.02;
const FRESNEL_REACH = 0.65;

/**
 * How much sky a surface with this normal is showing back.
 *
 * Schlick, with the base reflectance of water: a mirror at a glancing angle and
 * glass head on. Fed the swell's normal rather than the geometry's, so a crest
 * turning away from the eye lights up while the trough beside it stays the
 * colour of the water.
 */
export function skyFresnel(normal: Node<'vec3'>): Node<'float'> {
  const facing = saturate(dot(normalize(cameraPosition.sub(positionWorld)), normal));
  return float(FRESNEL_BASE).add(pow(facing.oneMinus(), 4).mul(FRESNEL_REACH));
}

/** A body of water, and the sky it has to go on reflecting as the day turns. */
export interface WaterMaterial {
  readonly material: MeshStandardNodeMaterial;
  /** Repaints the sky the water reflects, in packed sRGB. */
  setSky(sky: number): void;
  dispose(): void;
}

/** What a body of water hands back once it has decided how it looks. */
export interface WaterShading {
  readonly normal: Node<'vec3'>;
  readonly color: Node<'vec3'>;
  readonly roughness: Node<'float'>;
}

/**
 * Wires a shaded body of water onto its material.
 *
 * The last few lines of the sea and of the pools were the same lines, and for
 * a reason worth keeping true: both bend the shading normal so the sun answers
 * the swell, both take the resort's baked lamplight through the emissive term
 * rather than as a light, and both have to be told when the sky changes colour.
 * `shade` is handed the sky as a node so it can reflect it however it likes.
 */
export function waterMaterialOf(
  material: MeshStandardNodeMaterial,
  lightVolume: BakedLightVolume | null,
  shade: (sky: Node<'vec3'>) => WaterShading,
): WaterMaterial {
  const skyColor = uniform(new Vector3(...linearRgbOf(0x11161d)));
  const { normal, color, roughness } = shade(skyColor);

  material.normalNode = transformNormalToView(normal);
  material.colorNode = color;
  material.roughnessNode = roughness;
  // Water runs in under the resort's lamps like everything else: a pool or a
  // bay that stayed flatly blue while the paving beside it caught a pool of
  // lamplight would give the whole bake away.
  if (lightVolume) {
    material.emissiveNode = lightVolume.lampLight(color);
    material.aoNode = lightVolume.skyVisibility();
  }

  return {
    material,
    setSky(sky) {
      skyColor.value.set(...linearRgbOf(sky));
    },
    dispose() {
      material.dispose();
    },
  };
}
