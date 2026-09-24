import { MeshStandardNodeMaterial } from 'three/webgpu';
import { float, mix, vertexColor } from 'three/tsl';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import {
  skyFresnel,
  swellOf,
  waterMaterialOf,
  WATER_ROUGHNESS,
  type Wave,
  type WaterMaterial,
} from './waterSurface';

// No two wavelengths divide each other, or they beat into a visible pattern. Shorter than the sea's
// swell, which is longer than a pool and would tilt it rather than ripple it.
const RIPPLES: readonly Wave[] = [
  { direction: [1, 0.35], length: 17, speed: 3.5, slope: 0.06 },
  { direction: [-0.4, 1], length: 11, speed: 2.75, slope: 0.05 },
  { direction: [0.7, -0.7], length: 7, speed: 2, slope: 0.035 },
  { direction: [-1, -0.2], length: 5, speed: 1.5, slope: 0.025 },
];

// One instance for every pool: a material per pool would be a shader program per pool.
export function createPoolWaterMaterial(lightVolume: BakedLightVolume | null): WaterMaterial {
  const material = new MeshStandardNodeMaterial({ vertexColors: true, metalness: 0 });
  return waterMaterialOf(material, lightVolume, (sky) => {
    const { normal } = swellOf(RIPPLES);
    return {
      normal,
      // Vertex colour albedo lets pools be different blues off one material.
      color: mix(vertexColor().rgb, sky, skyFresnel(normal)),
      roughness: float(WATER_ROUGHNESS),
    };
  });
}
