/**
 * The water inland: the sea's shader at the scale of a river.
 *
 * The third body of water in the resort, and the third time the same three
 * things come out of `waterSurface.ts` — a wave field bending the shading
 * normal, the sun's own glint answering it through a low roughness, and a
 * Schlick term mixing the sky in at a glancing angle. All three are what make a
 * flat quad read as water rather than as paint, and none of them is worth a
 * second implementation.
 *
 * What it takes from neither of the other two is its *colour*. The sea grades
 * from sandbank green to open blue off the shore distances its geometry carries,
 * and a river has no shore and no depth to grade — it is a channel two tiles
 * wide, the same all the way down. A pool takes its albedo from the vertex
 * colours the model painted, and a river is terrain rather than a model, so
 * there are none. So it has one colour of its own, and it is a *river's*: siltier
 * and greener than the bay it runs into, because a metre of fresh water over mud
 * is, and because a river the same blue as the sea reads as an inlet of it.
 *
 * The ripples are the pool's rather than the sea's, and for the pool's reason:
 * the sea's long swell is 97 voxels from crest to crest, which is three times the
 * width of the channel it would be crossing — a river shaded with it would not
 * ripple, it would tilt. What it adds is a drift: a river runs, and the crests
 * are pulled one way rather than crossing from every side the way a pool's are.
 */

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

/**
 * Fresh water: greener and darker than the pools and than the open bay.
 *
 * Not from `PALETTE`, for the reason the sea's own colours are not: a palette
 * entry is an albedo a *model* paints with, and nothing in `voxel-gen/` paints a
 * river. It sits between the sea's sandbank green and its shallow turquoise,
 * which is where a shallow channel over silt belongs.
 */
const RIVER_COLOR = 0x3f8f86;

/**
 * Four ripples running with the current, no two of whose wavelengths divide each
 * other.
 *
 * The same rule as the sea's and the pools' — wavelengths sharing a factor beat
 * into a pattern the eye catches — with the one difference a river has: they all
 * travel broadly the same way, because what moves the water is the water going
 * somewhere rather than people in it or a fetch behind it. Down the plot, which
 * is the way every river on this plot runs: from the back of it to the sea at
 * +z. See `layout/domain/river.ts`.
 */
const RIPPLES: readonly Wave[] = [
  { direction: [0.12, 1], length: 19, speed: 4.5, slope: 0.055 },
  { direction: [-0.3, 1], length: 13, speed: 3.5, slope: 0.045 },
  { direction: [0.8, 0.6], length: 7, speed: 2.25, slope: 0.03 },
  { direction: [-0.9, 0.4], length: 5, speed: 1.75, slope: 0.02 },
];

/**
 * Builds the material every river and lake on the plot is drawn with.
 *
 * One instance for the whole scene, as with the pools': the channels differ in
 * geometry and in nothing else, and a material per body of water would be a
 * shader program per body of water to compile, bind and sort. The bake is handed
 * down for the pools' reason too — a river running past a lit promenade that
 * stayed flatly green after dark is exactly where the whole trick would come
 * apart.
 */
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
