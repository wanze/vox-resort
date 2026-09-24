import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, float, mix, smoothstep, vec3 } from 'three/tsl';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { linearRgbOf } from '../../lighting/domain/lightGrid';
import {
  skyFresnel,
  swellOf,
  waterMaterialOf,
  WATER_ROUGHNESS,
  type Wave,
  type WaterMaterial,
} from './waterSurface';

// `sandbank` is the sand seen through a foot of water: the sea is opaque, so this is the only way
// the shallows show what they lie on.
const COLORS = {
  sandbank: 0x5fc4b8,
  shallow: 0x2e9fb5,
  deep: 0x0e3f66,
  foam: 0xeaf6f7,
} as const;

const SHALLOW_REACH = 26;
const DEEP_REACH = 170;

const SWELL_DRAG = 9;

const FOAM_REACH = 15;
const FOAM_RETREAT = 2;

// No two wavelengths divide each other, so the waves never beat into a visible repeating tile.
const WAVES: readonly Wave[] = [
  { direction: [0, -1], length: 97, speed: 15, slope: 0.1 },
  { direction: [0.36, -0.93], length: 53, speed: 11.5, slope: 0.075 },
  { direction: [-0.62, -0.78], length: 23, speed: 7.5, slope: 0.05 },
  { direction: [0.86, -0.5], length: 11, speed: 4.5, slope: 0.03 },
];

const FOAM_ROUGHNESS = 0.9;

export type SeaMaterial = WaterMaterial;

export function createSeaMaterial(lightVolume: BakedLightVolume | null): SeaMaterial {
  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  const edgeDistance = attribute<'float'>('shoreEdgeDistance', 'float');
  const coastDistance = attribute<'float'>('shoreCoastDistance', 'float');

  return waterMaterialOf(material, lightVolume, (sky) => {
    const { normal, height } = swellOf(WAVES);

    const depth = coastDistance.add(height.mul(SWELL_DRAG));
    const shallowT = smoothstep(0, SHALLOW_REACH, depth);
    const deepT = smoothstep(SHALLOW_REACH, DEEP_REACH, depth);
    const water = mix(
      mix(vec3(...linearRgbOf(COLORS.sandbank)), vec3(...linearRgbOf(COLORS.shallow)), shallowT),
      vec3(...linearRgbOf(COLORS.deep)),
      deepT,
    );

    // Driven off the swell's height rather than a clock, so the water cannot rise while the foam retreats.
    const wash = height.mul(0.5).add(0.5);
    const foamEdge = mix(float(FOAM_RETREAT), float(FOAM_REACH), wash);
    const foam = smoothstep(foamEdge.mul(0.35), foamEdge, edgeDistance).oneMinus();

    // No sky in the foam: it is the one part of the sea that is not a mirror.
    const fresnel = skyFresnel(normal).mul(foam.oneMinus());

    return {
      normal,
      color: mix(mix(water, sky, fresnel), vec3(...linearRgbOf(COLORS.foam)), foam),
      roughness: mix(float(WATER_ROUGHNESS), float(FOAM_ROUGHNESS), foam),
    };
  });
}
