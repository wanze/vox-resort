/**
 * The water in the pools: the sea's shader, at the scale of a swimming pool.
 *
 * A pool used to be flat blue voxels, and next to a sea that swells, glints and
 * reflects the sunset it looked like paint. It is the same water, so it is the
 * same three things — a wave field bending the shading normal, the sun's own
 * glint answering it through a low roughness, and a Schlick term mixing the sky
 * in at a glancing angle. All three come out of `waterSurface.ts`, which is
 * what makes them the same and not merely similar.
 *
 * Two things are deliberately *not* here, and both are the sea's business:
 *
 * - **No depth gradient, no foam.** The sea grades from sandbank green to open
 *   blue off the shore distances its geometry carries; a pool has no shore and
 *   no distance, and its colour is the one the model painted. Which is why the
 *   albedo is the vertex colour: a paddling pool and a lagoon can be different
 *   blues without a second material.
 * - **No wavelength over two metres.** The sea's long swell is 97 voxels from
 *   crest to crest, which is two and a half times the length of the pool it
 *   would be crossing — a pool shaded with it would not ripple, it would tilt.
 *   The waves below are a tenth of that, and slower, because the thing making
 *   them is a child rather than the Atlantic.
 *
 * The geometry reaching this material is ordinary instanced model geometry: a
 * model declares which of its colours are water (see `voxel-gen/voxelgen.ts`),
 * and `domain/modelAttributes.ts` meshes those faces into a geometry of their
 * own. Waves are evaluated in world space, so two pools side by side agree
 * about where the crests are.
 */

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

/**
 * Four ripples, no two of whose wavelengths divide each other.
 *
 * Same rule as the sea's — wavelengths sharing a factor beat into a pattern the
 * eye catches — but crossing rather than running one way, because a pool has no
 * fetch for a swell to build over: what moves the water is people in it, from
 * every side at once. The slopes are gentler than the sea's for the same
 * reason.
 */
const RIPPLES: readonly Wave[] = [
  { direction: [1, 0.35], length: 17, speed: 3.5, slope: 0.06 },
  { direction: [-0.4, 1], length: 11, speed: 2.75, slope: 0.05 },
  { direction: [0.7, -0.7], length: 7, speed: 2, slope: 0.035 },
  { direction: [-1, -0.2], length: 5, speed: 1.5, slope: 0.025 },
];

/**
 * Builds the material every pool in the resort is drawn with.
 *
 * One instance for the whole scene, as with the lit and the glowing materials:
 * the pools differ in geometry and in the colour they painted, and a material
 * per pool would be a shader program per pool to compile, bind and sort. A
 * pool stands among the lamps rather than out at sea, which is why it is worth
 * handing the bake down: an unlit rectangle of blue in a lit terrace at night
 * is the one place the whole trick would come apart.
 */
export function createPoolWaterMaterial(lightVolume: BakedLightVolume | null): WaterMaterial {
  const material = new MeshStandardNodeMaterial({ vertexColors: true, metalness: 0 });
  return waterMaterialOf(material, lightVolume, (sky) => {
    const { normal } = swellOf(RIPPLES);
    return {
      normal,
      // The albedo is the colour the model painted, which is what lets a
      // paddling pool and a lagoon be different blues off one material.
      color: mix(vertexColor().rgb, sky, skyFresnel(normal)),
      roughness: float(WATER_ROUGHNESS),
    };
  });
}
