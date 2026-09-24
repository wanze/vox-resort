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

export interface Wave {
  readonly direction: readonly [number, number];
  readonly length: number;
  readonly speed: number;
  readonly slope: number;
}

// Each wave fades out past the distance where a wavelength drops below a pixel,
// or the far water aliases into moire.
const WAVE_FADE_LENGTHS = 30;

export interface Swell {
  readonly normal: Node<'vec3'>;
  readonly height: Node<'float'>;
}

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
    // Minus the clock, so a crest travels along its direction.
    const phase = dot(at, vec2(dirX, dirZ))
      .mul(frequency)
      .sub(time.mul(wave.speed * frequency));
    // Negate a rising ramp: swapping smoothstep edges is undefined in WGSL and GLSL.
    const faded = wave.length * WAVE_FADE_LENGTHS;
    const visible = smoothstep(faded * 0.5, faded, viewDistance).oneMinus();
    const amount = cos(phase).mul(wave.slope).mul(visible);
    slopeX = slopeX.add(amount.mul(dirX));
    slopeZ = slopeZ.add(amount.mul(dirZ));
    height = height.add(
      sin(phase)
        .mul(wave.slope / totalSlope)
        .mul(visible),
    );
  }
  return { normal: normalize(vec3(slopeX.negate(), 1, slopeZ.negate())), height };
}

export const WATER_ROUGHNESS = 0.14;

const FRESNEL_BASE = 0.02;
const FRESNEL_REACH = 0.65;

export function skyFresnel(normal: Node<'vec3'>): Node<'float'> {
  const facing = saturate(dot(normalize(cameraPosition.sub(positionWorld)), normal));
  return float(FRESNEL_BASE).add(pow(facing.oneMinus(), 4).mul(FRESNEL_REACH));
}

export interface WaterMaterial {
  readonly material: MeshStandardNodeMaterial;
  setSky(sky: number): void;
  dispose(): void;
}

export interface WaterShading {
  readonly normal: Node<'vec3'>;
  readonly color: Node<'vec3'>;
  readonly roughness: Node<'float'>;
}

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
  // Water takes the baked lamplight too, or it stays flat blue beside lit paving.
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
