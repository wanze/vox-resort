import { MeshStandardNodeMaterial } from 'three/webgpu';
import { float, mix, vec3 } from 'three/tsl';
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

// Not from PALETTE: palette entries are model albedos, and no model paints a river.
const RIVER_COLOR = 0x3f8f86;

// Pool-scale ripples: the sea's 97-voxel swell would tilt a two-tile channel rather than ripple it.
// No two wavelengths divide each other, or they beat into a visible pattern.
const RIPPLES: readonly Wave[] = [
  { direction: [0.12, 1], length: 19, speed: 4.5, slope: 0.055 },
  { direction: [-0.3, 1], length: 13, speed: 3.5, slope: 0.045 },
  { direction: [0.8, 0.6], length: 7, speed: 2.25, slope: 0.03 },
  { direction: [-0.9, 0.4], length: 5, speed: 1.75, slope: 0.02 },
];

// One shared instance: a material per body of water would be a shader program each.
export function createRiverMaterial(lightVolume: BakedLightVolume | null): WaterMaterial {
  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  return waterMaterialOf(material, lightVolume, (sky) => {
    const { normal } = swellOf(RIPPLES);
    return {
      normal,
      color: mix(vec3(...linearRgbOf(RIVER_COLOR)), sky, skyFresnel(normal)),
      roughness: float(WATER_ROUGHNESS),
    };
  });
}
